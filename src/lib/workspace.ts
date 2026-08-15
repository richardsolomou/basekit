import { defaultHolderConfig } from '../geometry/holder'
import { supportsFivePocketCross } from '../geometry/base'
import { automaticMagnetCount, DEFAULT_PRESET, footprintKey, presetFor, ribCountFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

const WORKSPACE_KEY = 'mini-bases.workspace'
const WORKSPACE_VERSION = 6

interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface WorkspaceState {
  base: BaseConfig
  holder: HolderConfig
  /** Values exposed by both generators have one canonical owner. */
  shared: SharedSettings
}

export interface SharedSettings {
  labelsEnabled: boolean
  wallThickness: number
  magnetBossWall: number
  magnetCounts: Record<string, number>
  magnets: Pick<
    BaseConfig['magnets'],
    'layout' | 'patternVersion' | 'maxCount' | 'latticePitch' | 'diameter' | 'thickness' | 'clearance' | 'depthClearance'
  >
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
      latticePitch: base.magnets.latticePitch,
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
  const layout = fiveCross ? 'five-cross' : shared.magnets.layout === 'lattice' ? 'lattice' : 'balanced'
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
      universal: { ...state.holder.universal, pitch: shared.magnets.latticePitch, layout: 'staggered' },
      magnets: { ...state.holder.magnets, ...shared.magnets },
    },
  }
}

export function defaultWorkspace(): WorkspaceState {
  const base = presetFor(DEFAULT_PRESET)
  return synchronizeWorkspace({ base, holder: defaultHolderConfig(), shared: sharedFromBase(base) })
}

export function loadWorkspace(storage: SettingsStorage): WorkspaceState {
  try {
    const saved = storage.getItem(WORKSPACE_KEY)
    if (saved === null) return defaultWorkspace()
    const parsed = JSON.parse(saved) as { version?: unknown; workspace?: unknown }
    const workspace =
      parsed.version === 1
        ? migrateWorkspaceV5(migrateWorkspaceV4(migrateWorkspaceV3(migrateWorkspaceV2(migrateWorkspaceV1(parsed.workspace)))))
        : parsed.version === 2
          ? migrateWorkspaceV5(migrateWorkspaceV4(migrateWorkspaceV3(migrateWorkspaceV2(parsed.workspace))))
          : parsed.version === 3
            ? migrateWorkspaceV5(migrateWorkspaceV4(migrateWorkspaceV3(parsed.workspace)))
            : parsed.version === 4
              ? migrateWorkspaceV5(migrateWorkspaceV4(parsed.workspace))
              : parsed.version === 5
                ? migrateWorkspaceV5(parsed.workspace)
                : parsed.workspace
    if (![1, 2, 3, 4, 5, WORKSPACE_VERSION].includes(parsed.version as number)) return defaultWorkspace()
    if (!isWorkspaceState(workspace, defaultWorkspace())) return defaultWorkspace()
    const base = { ...workspace.base } as BaseConfig & { underside?: unknown }
    delete base.underside
    return synchronizeWorkspace({ ...workspace, base })
  } catch {
    return defaultWorkspace()
  }
}

function migrateWorkspaceV5(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const shared = workspace.shared as Record<string, unknown> | undefined
  const base = workspace.base as Record<string, unknown> | undefined
  const holder = workspace.holder as Record<string, unknown> | undefined
  const sharedMagnets = shared?.magnets as Record<string, unknown> | undefined
  const baseMagnets = base?.magnets as Record<string, unknown> | undefined
  const holderMagnets = holder?.magnets as Record<string, unknown> | undefined
  if (!shared || !base || !holder || !sharedMagnets || !baseMagnets || !holderMagnets) return value
  return {
    ...workspace,
    shared: { ...shared, magnets: { latticePitch: 15, ...sharedMagnets } },
    base: { ...base, magnets: { latticePitch: 15, ...baseMagnets } },
    holder: {
      ...holder,
      universal: { ...defaultHolderConfig().universal, ...(holder.universal as Record<string, unknown>) },
      magnets: { latticePitch: 15, ...holderMagnets },
    },
  }
}

function migrateWorkspaceV4(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const holder = workspace.holder as Record<string, unknown> | undefined
  const universal = holder?.universal as Record<string, unknown> | undefined
  if (!holder || !universal) return value
  const defaults = defaultHolderConfig().universal
  return { ...workspace, holder: { ...holder, universal: { ...defaults, ...universal } } }
}

function migrateWorkspaceV3(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const workspace = value as Record<string, unknown>
  const holder = workspace.holder
  if (typeof holder !== 'object' || holder === null) return value
  const defaults = defaultHolderConfig()
  return { ...workspace, holder: { ...defaults, ...(holder as Record<string, unknown>), mode: 'fitted', universal: defaults.universal } }
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

function isWorkspaceState(value: unknown, template: WorkspaceState): value is WorkspaceState {
  if (!hasShape(value, template)) return false
  const workspace = value as WorkspaceState
  return (
    ['round', 'oval', 'pill', 'rect', 'polygon'].includes(workspace.base.shape) &&
    ['balanced', 'five-cross', 'lattice'].includes(workspace.shared.magnets.layout) &&
    [1, 2].includes(workspace.shared.magnets.patternVersion) &&
    workspace.holder.groups.every((group) => ['round', 'oval', 'pill', 'rect', 'polygon'].includes(group.shape)) &&
    Object.values(workspace.shared.magnetCounts).every((count) => typeof count === 'number' && Number.isFinite(count))
  )
}
