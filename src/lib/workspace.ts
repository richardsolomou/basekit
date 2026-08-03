import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

export interface WorkspaceState {
  base: BaseConfig
  holder: HolderConfig
  /** Values exposed by both generators have one canonical owner. */
  shared: SharedSettings
}

export interface SharedSettings {
  labelsEnabled: boolean
  magnets: Pick<BaseConfig['magnets'], 'diameter' | 'thickness' | 'clearance'>
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'mini-bases-workspace'
const VERSION = 2

function sharedFromBase(base: BaseConfig): SharedSettings {
  return {
    labelsEnabled: base.label.enabled,
    magnets: {
      diameter: base.magnets.diameter,
      thickness: base.magnets.thickness,
      clearance: base.magnets.clearance,
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

export function loadWorkspace(storage: StorageLike = window.localStorage): WorkspaceState {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.state?.base && saved.state?.holder?.kind === 'holder') {
      if (saved.version === VERSION && saved.state.shared) return synchronizeWorkspace(saved.state)
      if (saved.version === 1) return synchronizeWorkspace({ ...saved.state, shared: sharedFromBase(saved.state.base) })
    }
  } catch {}
  return defaultWorkspace()
}

export function saveWorkspace(state: WorkspaceState, storage: StorageLike = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, state }))
  } catch {}
}
