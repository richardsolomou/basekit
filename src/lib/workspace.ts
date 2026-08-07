import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, footprintKey, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

const WORKSPACE_KEY = 'mini-bases.workspace'
const WORKSPACE_VERSION = 3

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
  const count =
    legacyPattern && shared.magnets.layout === 'five-cross'
      ? 5
      : legacyPattern
        ? shared.magnetCounts[footprintKey(state.base.shape, state.base.width, state.base.length)]
        : undefined
  return {
    ...state,
    base: {
      ...state.base,
      wallThickness: shared.wallThickness,
      label: { ...state.base.label, enabled: shared.labelsEnabled },
      magnets: { ...state.base.magnets, ...shared.magnets, bossWall: shared.magnetBossWall, count: count ?? state.base.magnets.count },
      ribs: { ...state.base.ribs, count: legacyPattern && shared.magnets.layout === 'five-cross' ? 4 : state.base.ribs.count },
    },
    holder: {
      ...state.holder,
      baseWallThickness: shared.wallThickness,
      magnetBossWall: shared.magnetBossWall,
      magnetCounts: shared.magnetCounts,
      engraving: { ...state.holder.engraving, enabled: shared.labelsEnabled },
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
        ? migrateWorkspaceV2(migrateWorkspaceV1(parsed.workspace))
        : parsed.version === 2
          ? migrateWorkspaceV2(parsed.workspace)
          : parsed.workspace
    if (parsed.version !== WORKSPACE_VERSION && parsed.version !== 1 && parsed.version !== 2) return defaultWorkspace()
    if (!isWorkspaceState(workspace, defaultWorkspace())) return defaultWorkspace()
    return synchronizeWorkspace(workspace)
  } catch {
    return defaultWorkspace()
  }
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
  return {
    ...workspace,
    shared: { ...shared, magnets: { ...sharedMagnets, patternVersion: 1 } },
    base: { ...base, magnets: { ...baseMagnets, patternVersion: 1 } },
    holder: { ...holder, magnets: { ...holderMagnets, patternVersion: 1 } },
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
    ['balanced', 'five-cross'].includes(workspace.shared.magnets.layout) &&
    [1, 2].includes(workspace.shared.magnets.patternVersion) &&
    workspace.holder.groups.every((group) => ['round', 'oval', 'pill', 'rect', 'polygon'].includes(group.shape)) &&
    Object.values(workspace.shared.magnetCounts).every((count) => typeof count === 'number' && Number.isFinite(count))
  )
}
