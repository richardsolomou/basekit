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
