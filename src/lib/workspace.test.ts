import { describe, expect, it } from 'vitest'
import { defaultWorkspace, loadWorkspace, saveSharedSettings, synchronizeWorkspace } from './workspace'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('workspace state', () => {
  it('starts both generators at their defaults', () => {
    expect(defaultWorkspace()).toMatchObject({ base: { width: 32 }, holder: { kind: 'holder', groups: [{ width: 32 }] } })
  })

  it('keeps every setting exposed by both generators synchronized', () => {
    const state = defaultWorkspace()
    state.shared.labelsEnabled = false
    state.shared.magnets = { diameter: 6, thickness: 1.5, clearance: 0.3, depthClearance: 0.2 }
    const synchronized = synchronizeWorkspace(state)
    expect({ label: synchronized.base.label.enabled, engraving: synchronized.holder.engraving.enabled }).toEqual({
      label: false,
      engraving: false,
    })
    expect(synchronized.base.magnets).toMatchObject(synchronized.shared.magnets)
    expect(synchronized.holder.magnets).toMatchObject(synchronized.shared.magnets)
  })

  it('restores shared settings from browser storage', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    workspace.shared.labelsEnabled = false
    workspace.shared.magnets = { diameter: 6, thickness: 2, clearance: 0.3, depthClearance: 0.2 }
    saveSharedSettings(storage, workspace.shared)
    expect(loadWorkspace(storage).shared).toEqual(workspace.shared)
  })

  it('ignores invalid browser storage', () => {
    const storage = memoryStorage()
    storage.setItem('mini-bases.shared-settings', '{"version":1,"shared":{"labelsEnabled":false}}')
    expect(loadWorkspace(storage)).toEqual(defaultWorkspace())
  })
})
