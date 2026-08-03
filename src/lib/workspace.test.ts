import { describe, expect, it } from 'vitest'
import { loadWorkspace, saveWorkspace } from './workspace'

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
})
