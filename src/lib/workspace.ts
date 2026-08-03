import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor } from '../geometry/presets'
import type { BaseConfig, HolderConfig } from '../geometry/types'

export interface WorkspaceState {
  base: BaseConfig
  holder: HolderConfig
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'mini-bases-workspace'
const VERSION = 1

export function defaultWorkspace(): WorkspaceState {
  return { base: presetFor(DEFAULT_PRESET), holder: defaultHolderConfig() }
}

export function loadWorkspace(storage: StorageLike = window.localStorage): WorkspaceState {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.version === VERSION && saved.state?.base && saved.state?.holder?.kind === 'holder') return saved.state
  } catch {}
  return defaultWorkspace()
}

export function saveWorkspace(state: WorkspaceState, storage: StorageLike = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, state }))
  } catch {}
}
