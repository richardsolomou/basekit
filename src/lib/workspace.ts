import { defaultHolderConfig } from '../geometry/holder'
import {
  defaultPaintingTrayConfig,
  minimumPaintingTrayEdgeMargin,
  minimumPaintingTrayHeight,
  minimumPaintingTraySpacing,
} from '../geometry/paintingTray'
import { supportsFivePocketCross } from '../geometry/base'
import { defaultTokenConfig } from '../geometry/token'
import { automaticMagnetCount, DEFAULT_PRESET, footprintKey, presetFor, ribCountFor } from '../geometry/presets'
import { defaultFlightStemConfig } from '../geometry/stem'
import type { BaseConfig, FlightStemConfig, HolderConfig, ShapeKind, TokenConfig, PaintingTrayConfig } from '../geometry/types'

const WORKSPACE_KEY = 'mini-bases.workspace'
const WORKSPACE_VERSION = 9

const SHAPES = new Set<string>(['round', 'oval', 'pill', 'rect', 'polygon'])

interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface WorkspaceState {
  base: BaseConfig
  holder: HolderConfig
  paintingTray: PaintingTrayConfig
  stem: FlightStemConfig
  token: TokenConfig
  /** Values exposed by multiple generators have one canonical owner. */
  shared: SharedSettings
  /** Base footprints exported together, each built with the current base settings. */
  batch: BatchEntry[]
}

export interface BatchEntry {
  shape: ShapeKind
  width: number
  length: number
  quantity: number
}

export interface SharedSettings {
  labelsEnabled: boolean
  wallThickness: number
  magnetBossWall: number
  magnetCounts: Record<string, number>
  magnets: Pick<BaseConfig['magnets'], 'layout' | 'patternVersion' | 'maxCount' | 'diameter' | 'thickness' | 'clearance' | 'depthClearance'>
}

export function saveWorkspace(storage: SettingsStorage, workspace: WorkspaceState): void {
  try {
    storage.setItem(WORKSPACE_KEY, JSON.stringify({ version: WORKSPACE_VERSION, workspace }))
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function sharedFromBase(base: BaseConfig): SharedSettings {
  return {
    labelsEnabled: base.label.enabled,
    wallThickness: base.wallThickness,
    magnetBossWall: base.magnets.bossWall,
    magnetCounts: {},
    magnets: {
      layout: base.magnets.layout,
      patternVersion: base.magnets.patternVersion,
      maxCount: base.magnets.maxCount,
      diameter: base.magnets.diameter,
      thickness: base.magnets.thickness,
      clearance: base.magnets.clearance,
      depthClearance: base.magnets.depthClearance,
    },
  }
}

export function synchronizeWorkspace(state: WorkspaceState): WorkspaceState {
  const { shared } = state
  const legacyPattern = shared.magnets.patternVersion === 1
  const fiveCross = shared.magnets.layout === 'five-cross' && (legacyPattern || supportsFivePocketCross(state.base.shape, state.base.width))
  const layout = fiveCross ? 'five-cross' : 'balanced'
  const key = footprintKey(state.base.shape, state.base.width, state.base.length)
  const count = fiveCross
    ? 5
    : legacyPattern
      ? shared.magnetCounts[key]
      : (shared.magnetCounts[key] ??
        automaticMagnetCount(
          state.base.width,
          state.base.length,
          shared.magnets.maxCount,
          shared.magnets.diameter,
          shared.magnets.thickness,
        ))
  return {
    ...state,
    base: {
      ...state.base,
      wallThickness: shared.wallThickness,
      label: { ...state.base.label, enabled: shared.labelsEnabled },
      magnets: {
        ...state.base.magnets,
        ...shared.magnets,
        layout,
        bossWall: shared.magnetBossWall,
        count: count ?? state.base.magnets.count,
      },
      ribs: {
        ...state.base.ribs,
        count: fiveCross
          ? 4
          : legacyPattern
            ? state.base.ribs.count
            : count !== state.base.magnets.count
              ? ribCountFor(state.base.width, state.base.length, count)
              : state.base.ribs.count,
      },
    },
    holder: {
      ...state.holder,
      baseWallThickness: shared.wallThickness,
      magnetBossWall: shared.magnetBossWall,
      magnetCounts: shared.magnetCounts,
      engraving: { ...state.holder.engraving, enabled: shared.labelsEnabled },
      magnets: { ...state.holder.magnets, ...shared.magnets },
    },
    paintingTray: {
      ...state.paintingTray,
      height: Math.max(state.paintingTray.height, Math.ceil((minimumPaintingTrayHeight({ magnets: shared.magnets }) - 1e-6) * 10) / 10),
      spacing: Math.max(state.paintingTray.spacing, Math.ceil((minimumPaintingTraySpacing({ magnets: shared.magnets }) - 1e-6) * 10) / 10),
      edgeMargin: Math.max(
        state.paintingTray.edgeMargin,
        Math.ceil((minimumPaintingTrayEdgeMargin({ magnets: shared.magnets }) - 1e-6) * 10) / 10,
      ),
      magnets: { ...state.paintingTray.magnets, ...shared.magnets, enabled: true },
    },
  }
}

export function defaultWorkspace(): WorkspaceState {
  const base = presetFor(DEFAULT_PRESET)
  return synchronizeWorkspace({
    base,
    holder: defaultHolderConfig(),
    paintingTray: defaultPaintingTrayConfig(),
    stem: defaultFlightStemConfig(),
    token: defaultTokenConfig(),
    shared: sharedFromBase(base),
    batch: [],
  })
}

export type GeneratorSettings = Exclude<keyof WorkspaceState, 'shared' | 'batch'>

/** The batch is a list of base footprints, so it belongs to the base generator and resets with it. */
export function resetGenerator(state: WorkspaceState, part: GeneratorSettings): WorkspaceState {
  return synchronizeWorkspace({ ...state, [part]: defaultWorkspace()[part], ...(part === 'base' ? { batch: [] } : {}) })
}

export function resetShared(state: WorkspaceState): WorkspaceState {
  return synchronizeWorkspace({ ...state, shared: defaultWorkspace().shared })
}

export function loadWorkspace(storage: SettingsStorage): WorkspaceState {
  try {
    const saved = storage.getItem(WORKSPACE_KEY)
    if (saved === null) return defaultWorkspace()
    const parsed = JSON.parse(saved) as { version?: unknown; workspace?: unknown }
    const migrations = [
      migrateWorkspaceV1,
      migrateWorkspaceV2,
      migrateWorkspaceV3,
      migrateWorkspaceV4,
      migrateWorkspaceV5,
      migrateWorkspaceV6,
      migrateWorkspaceV7,
      migrateWorkspaceV8,
    ]
    const version = parsed.version
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > WORKSPACE_VERSION) return defaultWorkspace()
    const migrated = migrations.slice(version - 1).reduce((value, migrate) => migrate(value), parsed.workspace)
    const workspace = withValidBatch(migrated)
    if (!isWorkspaceState(workspace, defaultWorkspace())) return defaultWorkspace()
    const base = { ...workspace.base } as BaseConfig & { underside?: unknown }
    delete base.underside
    return synchronizeWorkspace({ ...workspace, base })
  } catch {
    return defaultWorkspace()
  }
}

function isBatchEntry(entry: unknown): entry is BatchEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const { shape, width, length, quantity } = entry as Record<string, unknown>
  const size = (value: unknown) => typeof value === 'number' && value >= 15 && value <= 180
  return (
    typeof shape === 'string' && SHAPES.has(shape) && size(width) && size(length) && Number.isInteger(quantity) && (quantity as number) >= 1
  )
}

/** Workspaces saved before batches existed load with an empty one, and a damaged entry costs only itself. */
function withValidBatch(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const { batch } = value as Record<string, unknown>
  return { ...value, batch: Array.isArray(batch) ? batch.filter(isBatchEntry) : [] }
}

function migrateWorkspaceV8(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const saved = workspace.token as Record<string, unknown> | undefined
  if (!saved || !('diameter' in saved)) return value
  const { diameter, ...token } = saved
  return { ...workspace, token: { ...token, shape: 'round', size: diameter, cornerRadius: defaultTokenConfig().cornerRadius } }
}

function migrateWorkspaceV7(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  return { ...(value as Record<string, unknown>), token: defaultTokenConfig() }
}

function migrateWorkspaceV6(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  return { ...(value as Record<string, unknown>), paintingTray: defaultPaintingTrayConfig() }
}

function migrateWorkspaceV5(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const stem = workspace.stem
  if (typeof stem !== 'object' || stem === null) return value
  return { ...workspace, stem: { ...defaultFlightStemConfig(), ...stem } }
}

function migrateWorkspaceV4(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  return { ...(value as Record<string, unknown>), stem: defaultFlightStemConfig() }
}

function migrateWorkspaceV3(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const holder = workspace.holder as Record<string, unknown> | undefined
  if (!holder || typeof holder.spacing !== 'number' || !Number.isFinite(holder.spacing)) return value
  return { ...workspace, holder: { ...holder, edgeSpacing: holder.spacing / 2 } }
}

function migrateWorkspaceV2(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const shared = workspace.shared as Record<string, unknown> | undefined
  const base = workspace.base as Record<string, unknown> | undefined
  const holder = workspace.holder as Record<string, unknown> | undefined
  if (!shared || !base || !holder) return value
  const sharedMagnets = shared.magnets as Record<string, unknown> | undefined
  const baseMagnets = base.magnets as Record<string, unknown> | undefined
  const holderMagnets = holder.magnets as Record<string, unknown> | undefined
  if (!sharedMagnets || !baseMagnets || !holderMagnets) return value
  const patternVersion = sharedMagnets.layout === 'five-cross' ? 1 : 2
  return {
    ...workspace,
    shared: { ...shared, magnets: { ...sharedMagnets, patternVersion } },
    base: { ...base, magnets: { ...baseMagnets, patternVersion } },
    holder: { ...holder, magnets: { ...holderMagnets, patternVersion } },
  }
}

function migrateWorkspaceV1(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const shared = workspace.shared as Record<string, unknown> | undefined
  const base = workspace.base as Record<string, unknown> | undefined
  const holder = workspace.holder as Record<string, unknown> | undefined
  if (!shared || !base || !holder) return value
  const sharedMagnets = shared.magnets as Record<string, unknown> | undefined
  const baseMagnets = base.magnets as Record<string, unknown> | undefined
  const holderMagnets = holder.magnets as Record<string, unknown> | undefined
  if (!sharedMagnets || !baseMagnets || !holderMagnets) return value
  return {
    ...workspace,
    shared: { ...shared, magnets: { ...sharedMagnets, layout: 'balanced' } },
    base: { ...base, magnets: { ...baseMagnets, layout: 'balanced' } },
    holder: { ...holder, magnets: { ...holderMagnets, layout: 'balanced' } },
  }
}

function hasShape(value: unknown, template: unknown): boolean {
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (Array.isArray(template)) return Array.isArray(value) && (template.length === 0 || value.every((item) => hasShape(item, template[0])))
  if (typeof template !== 'object' || template === null) return typeof value === typeof template
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(template).every(([key, child]) => hasShape((value as Record<string, unknown>)[key], child))
}

function isTokenImage(image: unknown): boolean {
  if (image === null) return true
  const { name, width, height, luminance } = image as Record<string, unknown>
  return (
    typeof name === 'string' &&
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    typeof luminance === 'string' &&
    Math.ceil(((width as number) * (height as number)) / 3) * 4 === luminance.length
  )
}

function isWorkspaceState(value: unknown, template: WorkspaceState): value is WorkspaceState {
  if (!hasShape(value, template)) return false
  const workspace = value as WorkspaceState
  return (
    SHAPES.has(workspace.base.shape) &&
    ['balanced', 'five-cross'].includes(workspace.shared.magnets.layout) &&
    [1, 2].includes(workspace.shared.magnets.patternVersion) &&
    workspace.stem.kind === 'stem' &&
    workspace.token.kind === 'token' &&
    ['round', 'square', 'hex'].includes(workspace.token.shape) &&
    ['taper', 'straight', 'bevel', 'round'].includes(workspace.token.profile) &&
    isTokenImage(workspace.token.image) &&
    workspace.paintingTray.kind === 'painting-tray' &&
    ['round', 'oval', 'flared', 'pistol'].includes(workspace.paintingTray.handle.shape) &&
    ['peg', 'ball'].includes(workspace.stem.connection) &&
    workspace.holder.groups.every((group) => SHAPES.has(group.shape)) &&
    Object.values(workspace.shared.magnetCounts).every((count) => typeof count === 'number' && Number.isFinite(count))
  )
}
