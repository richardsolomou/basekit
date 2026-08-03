import { describe, expect, it } from 'vitest'
import { footprintKey } from '../geometry/presets'
import { defaultWorkspace, loadWorkspace, saveWorkspace, synchronizeWorkspace } from './workspace'

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
    state.shared.wallThickness = 2.5
    state.shared.magnetBossWall = 1.1
    state.shared.magnetCounts[footprintKey(state.base.shape, state.base.width, state.base.length)] = 4
    state.shared.magnets = { maxCount: 8, diameter: 6, thickness: 1.5, clearance: 0.3, depthClearance: 0.2 }
    const synchronized = synchronizeWorkspace(state)
    expect({ label: synchronized.base.label.enabled, engraving: synchronized.holder.engraving.enabled }).toEqual({
      label: false,
      engraving: false,
    })
    expect(synchronized.base.magnets).toMatchObject(synchronized.shared.magnets)
    expect(synchronized.holder.magnets).toMatchObject(synchronized.shared.magnets)
    expect({ base: synchronized.base.magnets.count, holder: synchronized.holder.magnetCounts }).toEqual({
      base: 4,
      holder: synchronized.shared.magnetCounts,
    })
    expect({
      baseWall: synchronized.base.wallThickness,
      baseBoss: synchronized.base.magnets.bossWall,
      holderWall: synchronized.holder.baseWallThickness,
      holderBoss: synchronized.holder.magnetBossWall,
    }).toEqual({ baseWall: 2.5, baseBoss: 1.1, holderWall: 2.5, holderBoss: 1.1 })
  })

  it('restores the workspace from browser storage', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    workspace.base.width = 40
    workspace.holder.maxColumns = 4
    workspace.shared.labelsEnabled = false
    workspace.shared.magnets = { maxCount: 8, diameter: 6, thickness: 2, clearance: 0.3, depthClearance: 0.2 }
    const synchronized = synchronizeWorkspace(workspace)
    saveWorkspace(storage, synchronized)
    expect(loadWorkspace(storage)).toEqual(synchronized)
  })

  it('ignores invalid browser storage', () => {
    const storage = memoryStorage()
    storage.setItem('mini-bases.workspace', '{"version":1,"workspace":{"shared":{"labelsEnabled":false}}}')
    expect(loadWorkspace(storage)).toEqual(defaultWorkspace())
  })
})
