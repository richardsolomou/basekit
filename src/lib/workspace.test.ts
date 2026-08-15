import { describe, expect, it } from 'vitest'
import { holderSlotMagnetCenters } from '../geometry/holder'
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
    expect(defaultWorkspace()).toMatchObject({
      base: { width: 32, magnets: { patternVersion: 2 } },
      holder: { kind: 'holder', groups: [{ width: 32 }], magnets: { patternVersion: 2 } },
    })
  })

  it('keeps every setting exposed by both generators synchronized', () => {
    const state = defaultWorkspace()
    state.base = { ...state.base, width: 60, length: 60 }
    state.shared.labelsEnabled = false
    state.shared.wallThickness = 2.5
    state.shared.magnetBossWall = 1.1
    state.shared.magnets.layout = 'five-cross'
    state.shared.magnetCounts[footprintKey(state.base.shape, state.base.width, state.base.length)] = 4
    state.shared.magnets = {
      layout: 'five-cross',
      patternVersion: 2,
      maxCount: 8,
      diameter: 6,
      thickness: 1.5,
      clearance: 0.3,
      depthClearance: 0.2,
    }
    const synchronized = synchronizeWorkspace(state)
    expect({ label: synchronized.base.label.enabled, engraving: synchronized.holder.engraving.enabled }).toEqual({
      label: false,
      engraving: false,
    })
    expect(synchronized.base.magnets).toMatchObject(synchronized.shared.magnets)
    expect(synchronized.holder.magnets).toMatchObject(synchronized.shared.magnets)
    expect({ base: synchronized.base.magnets.count, ribs: synchronized.base.ribs.count, holder: synchronized.holder.magnetCounts }).toEqual(
      {
        base: 5,
        ribs: 4,
        holder: synchronized.shared.magnetCounts,
      },
    )
    expect({
      baseWall: synchronized.base.wallThickness,
      baseBoss: synchronized.base.magnets.bossWall,
      holderWall: synchronized.holder.baseWallThickness,
      holderBoss: synchronized.holder.magnetBossWall,
    }).toEqual({ baseWall: 2.5, baseBoss: 1.1, holderWall: 2.5, holderBoss: 1.1 })
  })

  it('limits new five-pocket crosses to round bases at least 50mm wide', () => {
    const state = defaultWorkspace()
    state.shared.magnets.layout = 'five-cross'

    const small = synchronizeWorkspace(state)
    const large = synchronizeWorkspace({ ...state, base: { ...state.base, width: 50, length: 50 } })
    const oval = synchronizeWorkspace({ ...state, base: { ...state.base, shape: 'oval', width: 60, length: 35 } })

    expect({
      small: { layout: small.base.magnets.layout, count: small.base.magnets.count },
      large: { layout: large.base.magnets.layout, count: large.base.magnets.count },
      oval: { layout: oval.base.magnets.layout, count: oval.base.magnets.count },
    }).toEqual({
      small: { layout: 'balanced', count: 1 },
      large: { layout: 'five-cross', count: 5 },
      oval: { layout: 'balanced', count: 2 },
    })
  })

  it('migrates saved workspaces to the balanced pocket layout', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    const legacy = JSON.parse(JSON.stringify(workspace))
    delete legacy.shared.magnets.layout
    delete legacy.base.magnets.layout
    delete legacy.holder.magnets.layout
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 1, workspace: legacy }))
    expect(loadWorkspace(storage).shared.magnets).toMatchObject({ layout: 'balanced', patternVersion: 2 })
  })

  it('drops the unsupported solid underside from saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.base.underside = 'solid'
    delete legacy.shared.magnets.patternVersion
    delete legacy.base.magnets.patternVersion
    delete legacy.holder.magnets.patternVersion
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 2, workspace: legacy }))

    expect(loadWorkspace(storage).base).not.toHaveProperty('underside')
  })

  it('preserves saved count and layout behavior as the legacy pocket pattern', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    const legacy = JSON.parse(JSON.stringify(workspace))
    delete legacy.shared.magnets.patternVersion
    delete legacy.base.magnets.patternVersion
    delete legacy.holder.magnets.patternVersion
    legacy.shared.magnets.layout = 'five-cross'
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 2, workspace: legacy }))
    expect(loadWorkspace(storage).shared.magnets).toMatchObject({ layout: 'five-cross', patternVersion: 1 })
  })

  it('preserves saved balanced counts for matching bases and holders', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    const footprint = { shape: 'oval', width: 90, length: 52 }
    legacy.base = { ...legacy.base, ...footprint }
    legacy.holder.groups[0] = { ...legacy.holder.groups[0], ...footprint }
    legacy.shared.magnetCounts['oval:90x52'] = 1
    delete legacy.shared.magnets.patternVersion
    delete legacy.base.magnets.patternVersion
    delete legacy.holder.magnets.patternVersion
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 2, workspace: legacy }))

    const loaded = loadWorkspace(storage)
    expect({ base: loaded.base.magnets.count, holder: holderSlotMagnetCenters(loaded.holder.groups[0], loaded.holder).length }).toEqual({
      base: 1,
      holder: 1,
    })
  })

  it('migrates existing fitted holders without changing their layout', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    delete legacy.holder.mode
    delete legacy.holder.universal
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 3, workspace: legacy }))

    expect(loadWorkspace(storage).holder).toMatchObject({
      mode: 'fitted',
      groups: [{ width: 32 }],
      universal: { pitch: 15, layout: 'staggered', rimHeight: 3, rimThickness: 2 },
    })
  })

  it('adds printable piece defaults to saved universal trays', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.holder.mode = 'universal'
    delete legacy.holder.universal.split
    delete legacy.holder.universal.maxPieceColumns
    delete legacy.holder.universal.maxPieceRows
    delete legacy.holder.universal.rimEdges
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 4, workspace: legacy }))

    expect(loadWorkspace(storage).holder.universal).toMatchObject({
      split: false,
      maxPieceColumns: 3,
      maxPieceRows: 3,
      rimEdges: { left: true, right: true, front: true, back: true },
    })
  })

  it('automatically responds to magnet dimensions until the count is overridden', () => {
    const state = defaultWorkspace()
    state.base = { ...state.base, width: 80, length: 80 }
    state.holder.groups[0] = { ...state.holder.groups[0], width: 80, length: 80 }
    state.shared.magnets = { ...state.shared.magnets, diameter: 3, thickness: 1 }

    const automatic = synchronizeWorkspace(state)
    expect({
      base: automatic.base.magnets.count,
      holder: holderSlotMagnetCenters(automatic.holder.groups[0], automatic.holder).length,
      ribs: automatic.base.ribs.count,
    }).toEqual({
      base: 8,
      holder: 8,
      ribs: 8,
    })

    automatic.shared.magnetCounts['round:80x80'] = 4
    const overridden = synchronizeWorkspace(automatic)
    expect({
      base: overridden.base.magnets.count,
      holder: holderSlotMagnetCenters(overridden.holder.groups[0], overridden.holder).length,
      ribs: overridden.base.ribs.count,
    }).toEqual({
      base: 4,
      holder: 4,
      ribs: 4,
    })

    overridden.base.ribs.count = 0
    expect(synchronizeWorkspace(overridden).base.ribs.count).toBe(0)
  })

  it('restores the workspace from browser storage', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    workspace.base.width = 40
    workspace.holder.maxColumns = 4
    workspace.shared.labelsEnabled = false
    workspace.shared.magnets = {
      layout: 'five-cross',
      patternVersion: 1,
      maxCount: 8,
      diameter: 6,
      thickness: 2,
      clearance: 0.3,
      depthClearance: 0.2,
    }
    const synchronized = synchronizeWorkspace(workspace)
    saveWorkspace(storage, synchronized)
    expect(loadWorkspace(storage)).toEqual(synchronized)
  })

  it('preserves saved construction and fit preferences', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    workspace.base = { ...workspace.base, width: 80, length: 80, height: 4, floorThickness: 1 }
    workspace.shared.magnets.depthClearance = 0
    const saved = synchronizeWorkspace(workspace)
    saveWorkspace(storage, saved)
    expect(loadWorkspace(storage)).toEqual(saved)
  })

  it('ignores invalid browser storage', () => {
    const storage = memoryStorage()
    storage.setItem('mini-bases.workspace', '{"version":1,"workspace":{"shared":{"labelsEnabled":false}}}')
    expect(loadWorkspace(storage)).toEqual(defaultWorkspace())
  })
})
