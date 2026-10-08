import { describe, expect, it } from 'vitest'
import { holderSlotMagnetCenters } from '../geometry/holder'
import { footprintKey } from '../geometry/presets'
import {
  defaultWorkspace,
  loadWorkspace,
  resetGenerator,
  resetShared,
  saveWorkspace,
  synchronizeWorkspace,
  type WorkspaceState,
} from './workspace'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('workspace state', () => {
  it('starts every generator at its defaults', () => {
    expect(defaultWorkspace()).toMatchObject({
      base: { width: 32, magnets: { patternVersion: 2 } },
      holder: { kind: 'holder', groups: [{ width: 32 }], magnets: { patternVersion: 2 } },
      paintingTray: {
        kind: 'painting-tray',
        columns: 4,
        rows: 4,
        spacing: 50,
        edgeMargin: 12,
        magnets: { patternVersion: 2 },
        handle: {
          shape: 'round',
          length: 100,
          width: 28,
          angle: 0,
          roundedEnd: false,
          ribs: false,
        },
      },
      stem: { kind: 'stem', bodyHeight: 15, bodyDiameter: 4.8, connection: 'peg', modelPegDiameter: 1.8, ballDiameter: 4 },
      token: { kind: 'token', diameter: 40, thickness: 3, text: '1' },
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
    expect(synchronized.paintingTray.magnets).toMatchObject(synchronized.shared.magnets)
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

  it('grows the painting tray around larger shared magnet pockets', () => {
    const state = defaultWorkspace()
    state.paintingTray.spacing = 5
    state.paintingTray.edgeMargin = 1
    state.shared.magnets.diameter = 8
    state.shared.magnets.clearance = 0.6
    state.shared.magnets.thickness = 3
    state.shared.magnets.depthClearance = 0.2

    expect(synchronizeWorkspace(state).paintingTray).toMatchObject({ height: 4.1, spacing: 13.3, edgeMargin: 5.1 })
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

  it('adds half the miniature spacing at holder edges to saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.holder.spacing = 3
    delete legacy.holder.edgeSpacing
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 3, workspace: legacy }))

    expect(loadWorkspace(storage).holder.edgeSpacing).toBe(1.5)
  })

  it('adds the flying-stem generator to saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    delete legacy.stem
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 4, workspace: legacy }))

    expect(loadWorkspace(storage).stem).toMatchObject({ kind: 'stem', bodyHeight: 15, bodyDiameter: 4.8, modelPegDiameter: 1.8 })
  })

  it('adds ball-joint settings to saved flying stems', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.stem.bodyHeight = 20
    delete legacy.stem.connection
    delete legacy.stem.ballDiameter
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 5, workspace: legacy }))

    expect(loadWorkspace(storage).stem).toMatchObject({ bodyHeight: 20, connection: 'peg', ballDiameter: 4 })
  })

  it('adds the objective-token generator to saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.stem.bodyHeight = 20
    delete legacy.token
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 7, workspace: legacy }))

    expect(loadWorkspace(storage)).toMatchObject({ stem: { bodyHeight: 20 }, token: { kind: 'token', diameter: 40, text: '1' } })
  })

  it('adds an empty base batch to saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    legacy.token.text = '6'
    delete legacy.batch
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 8, workspace: legacy }))

    expect(loadWorkspace(storage)).toMatchObject({ token: { text: '6' }, batch: [] })
  })

  it('keeps a saved base batch', () => {
    const storage = memoryStorage()
    const batch = [
      { shape: 'round' as const, width: 28.5, length: 28.5, quantity: 10 },
      { shape: 'oval' as const, width: 60, length: 35, quantity: 3 },
    ]
    saveWorkspace(storage, { ...defaultWorkspace(), batch })

    expect(loadWorkspace(storage).batch).toEqual(batch)
  })

  it('drops damaged batch entries without discarding the workspace', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    const kept = { shape: 'round', width: 40, length: 40, quantity: 2 }
    const batch = [kept, { shape: 'star', width: 40, length: 40, quantity: 1 }, { ...kept, quantity: 0 }, { ...kept, width: '40' }]
    storage.setItem(
      'mini-bases.workspace',
      JSON.stringify({ version: 8, workspace: { ...workspace, token: { ...workspace.token, text: '6' }, batch } }),
    )

    expect(loadWorkspace(storage)).toMatchObject({ token: { text: '6' }, batch: [kept] })
  })

  it('keeps a saved objective token', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    saveWorkspace(storage, { ...workspace, token: { ...workspace.token, text: '6' } })

    expect(loadWorkspace(storage).token.text).toBe('6')
  })

  it('keeps an uploaded token image', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    const image = { name: 'skull.png', width: 2, height: 2, luminance: btoa('\0\xff\xff\0') }
    saveWorkspace(storage, { ...workspace, token: { ...workspace.token, image } })

    expect(loadWorkspace(storage).token.image).toEqual(image)
  })

  it('discards a workspace whose token image does not match its size', () => {
    const storage = memoryStorage()
    const workspace = defaultWorkspace()
    const image = { name: 'skull.png', width: 20, height: 20, luminance: btoa('\0\xff\xff\0') }
    saveWorkspace(storage, { ...workspace, token: { ...workspace.token, text: 'kept?', image } })

    expect(loadWorkspace(storage).token.text).toBe('1')
  })

  it('adds the painting-tray generator to saved workspaces', () => {
    const storage = memoryStorage()
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace()))
    delete legacy.paintingTray
    storage.setItem('mini-bases.workspace', JSON.stringify({ version: 6, workspace: legacy }))

    expect(loadWorkspace(storage).paintingTray).toMatchObject({
      kind: 'painting-tray',
      columns: 4,
      rows: 4,
      spacing: 50,
      edgeMargin: 12,
      height: 3,
      handle: { shape: 'round', length: 100 },
    })
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

function customizedWorkspace() {
  const state = defaultWorkspace()
  state.base = { ...state.base, width: 60, length: 60, height: 5, label: { ...state.base.label, text: 'SQUAD 3' } }
  state.holder = { ...state.holder, height: 30 }
  state.paintingTray = { ...state.paintingTray, rows: 2, columns: 3 }
  state.stem = { ...state.stem, bodyDiameter: 6 }
  state.token = { ...state.token, text: 'A', diameter: 32 }
  state.shared = { ...state.shared, labelsEnabled: false, magnets: { ...state.shared.magnets, diameter: 6 } }
  state.batch = [{ shape: 'round', width: 40, length: 40, quantity: 3 }]
  return synchronizeWorkspace(state)
}

describe('resetting settings', () => {
  const parts = ['base', 'holder', 'paintingTray', 'stem', 'token'] as const

  it.each([
    ['base', (state: WorkspaceState) => state.base.height],
    ['holder', (state: WorkspaceState) => state.holder.height],
    ['paintingTray', (state: WorkspaceState) => state.paintingTray.rows],
    ['stem', (state: WorkspaceState) => state.stem],
    ['token', (state: WorkspaceState) => state.token],
  ] as const)('restores the %s settings to their defaults', (part, read) => {
    expect(read(resetGenerator(customizedWorkspace(), part))).toEqual(read(defaultWorkspace()))
  })

  it.each(parts)('leaves every other generator unchanged when the %s is reset', (part) => {
    const before = customizedWorkspace()
    const { [part]: _reset, batch: _resetBatch, ...others } = resetGenerator(before, part)
    const { [part]: _original, batch: _originalBatch, ...expected } = before
    expect(others).toEqual(expected)
  })

  it('empties the batch list on a reset base', () => {
    expect(resetGenerator(customizedWorkspace(), 'base').batch).toEqual([])
  })

  it.each(parts.filter((part) => part !== 'base'))('keeps the batch list when the %s is reset', (part) => {
    expect(resetGenerator(customizedWorkspace(), part).batch).toEqual(customizedWorkspace().batch)
  })

  it('keeps the batch list when the shared settings are reset', () => {
    expect(resetShared(customizedWorkspace()).batch).toEqual(customizedWorkspace().batch)
  })

  it('keeps the shared magnet settings on a reset base', () => {
    expect(resetGenerator(customizedWorkspace(), 'base').base.magnets.diameter).toBe(6)
  })

  it('clears custom label text on a reset base', () => {
    expect(resetGenerator(customizedWorkspace(), 'base').base.label.text).toBe(defaultWorkspace().base.label.text)
  })

  it('returns a reset base to the default footprint', () => {
    expect(resetGenerator(customizedWorkspace(), 'base').base.width).toBe(defaultWorkspace().base.width)
  })

  it('restores the shared settings to their defaults', () => {
    expect(resetShared(customizedWorkspace()).shared).toEqual(defaultWorkspace().shared)
  })

  it('applies the default shared settings to every generator that uses them', () => {
    expect(resetShared(customizedWorkspace()).holder.magnets.diameter).toBe(defaultWorkspace().holder.magnets.diameter)
  })

  it('keeps generator-owned settings when the shared settings are reset', () => {
    const reset = resetShared(customizedWorkspace())
    expect({ width: reset.base.width, rows: reset.paintingTray.rows, stem: reset.stem, token: reset.token }).toEqual({
      width: 60,
      rows: 2,
      stem: customizedWorkspace().stem,
      token: customizedWorkspace().token,
    })
  })
})
