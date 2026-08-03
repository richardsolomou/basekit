import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

const SHARED_SETTINGS_KEY = 'mini-bases.shared-settings'
const SHARED_SETTINGS_VERSION = 1

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
  magnets: Pick<BaseConfig['magnets'], 'diameter' | 'thickness' | 'clearance' | 'depthClearance'>
}

function isSharedSettings(value: unknown): value is SharedSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as Partial<SharedSettings>
  const magnets = settings.magnets
  return (
    typeof settings.labelsEnabled === 'boolean' &&
    typeof magnets === 'object' &&
    magnets !== null &&
    [magnets.diameter, magnets.thickness, magnets.clearance, magnets.depthClearance].every(
      (number) => typeof number === 'number' && Number.isFinite(number),
    )
  )
}

function loadSharedSettings(storage: SettingsStorage): SharedSettings | undefined {
  try {
    const saved = storage.getItem(SHARED_SETTINGS_KEY)
    if (saved === null) return undefined
    const parsed = JSON.parse(saved) as { version?: unknown; shared?: unknown }
    return parsed.version === SHARED_SETTINGS_VERSION && isSharedSettings(parsed.shared) ? parsed.shared : undefined
  } catch {
    return undefined
  }
}

export function saveSharedSettings(storage: SettingsStorage, shared: SharedSettings): void {
  try {
    storage.setItem(SHARED_SETTINGS_KEY, JSON.stringify({ version: SHARED_SETTINGS_VERSION, shared }))
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function sharedFromBase(base: BaseConfig): SharedSettings {
  return {
    labelsEnabled: base.label.enabled,
    magnets: {
      diameter: base.magnets.diameter,
      thickness: base.magnets.thickness,
      clearance: base.magnets.clearance,
      depthClearance: base.magnets.depthClearance,
    },
  }
}

export function synchronizeWorkspace(state: WorkspaceState): WorkspaceState {
  const { shared } = state
  return {
    ...state,
    base: {
      ...state.base,
      label: { ...state.base.label, enabled: shared.labelsEnabled },
      magnets: { ...state.base.magnets, ...shared.magnets },
    },
    holder: {
      ...state.holder,
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
  const workspace = defaultWorkspace()
  const shared = loadSharedSettings(storage)
  return shared === undefined ? workspace : synchronizeWorkspace({ ...workspace, shared })
}
