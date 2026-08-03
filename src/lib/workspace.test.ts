import { describe, expect, it } from 'vitest'
import { loadWorkspace, saveWorkspace, synchronizeWorkspace } from './workspace'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

describe('workspace storage', () => {
  it('restores base and holder state together', () => {
    const storage = memoryStorage()
    const state = loadWorkspace(storage)
    state.base.width = 90
    state.holder.groups[0].width = 90
    saveWorkspace(state, storage)
    expect(loadWorkspace(storage)).toEqual(state)
  })

  it('ignores malformed saved state', () => {
    expect(loadWorkspace(memoryStorage('{bad json'))).toMatchObject({ base: { width: 32 }, holder: { kind: 'holder' } })
  })

  it('keeps every setting exposed by both generators synchronized', () => {
    const state = loadWorkspace(memoryStorage())
    state.shared.labelsEnabled = false
    state.shared.magnets = { diameter: 6, thickness: 1.5, clearance: 0.3 }
    const synchronized = synchronizeWorkspace(state)
    expect({ label: synchronized.base.label.enabled, engraving: synchronized.holder.engraving.enabled }).toEqual({
      label: false,
      engraving: false,
    })
    expect(synchronized.base.magnets).toMatchObject(synchronized.shared.magnets)
    expect(synchronized.holder.magnets).toMatchObject(synchronized.shared.magnets)
  })

  it('migrates split version one state using the base preferences', () => {
    const state = loadWorkspace(memoryStorage())
    const legacy = JSON.stringify({
      version: 1,
      state: {
        base: { ...state.base, label: { ...state.base.label, enabled: false } },
        holder: { ...state.holder, engraving: { ...state.holder.engraving, enabled: true } },
      },
    })
    const migrated = loadWorkspace(memoryStorage(legacy))
    expect({ shared: migrated.shared.labelsEnabled, base: migrated.base.label.enabled, holder: migrated.holder.engraving.enabled }).toEqual(
      {
        shared: false,
        base: false,
        holder: false,
      },
    )
  })
})
