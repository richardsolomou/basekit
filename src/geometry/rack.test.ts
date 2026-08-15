import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import {
  buildRack,
  defaultRackConfig,
  rackDimensions,
  rackHardware,
  rackName,
  rackShelfDimensions,
  rackShelfLevels,
  rackTiles,
} from './rack'

let wasm: Awaited<ReturnType<typeof loadManifold>>

beforeAll(async () => {
  wasm = await loadManifold()
})

describe('transport rack', () => {
  it('builds a support-free multi-part print kit', () => {
    const config = { ...defaultRackConfig(), view: 'print' as const }
    const result = buildRack(wasm, config)
    expect(result.stats.solid).toBe(true)
    expect(result.stats.volume).toBeLessThan(310_000)
    const rack = new wasm.Manifold(result.mesh)
    const parts = rack.decompose()
    expect(parts.length).toBeGreaterThan(2 + config.shelfCount)
    expect(rack.boundingBox().min[2]).toBeCloseTo(0)
    for (const part of parts) part.delete()
    rack.delete()
  })

  it('shows the finished rack assembled without changing the exportable parts', () => {
    const config = defaultRackConfig()
    const assembled = buildRack(wasm, config)
    expect(assembled.stats.solid).toBe(true)
    expect(rackDimensions(config).height).toBe(196)
    expect(rackDimensions({ ...config, view: 'print' }).height).toBe(14)
  })

  it('splits a 7x5 shelf into printer-sized interconnecting tiles', () => {
    const tiles = rackTiles({ ...defaultRackConfig(), columns: 7, rows: 5, tileColumns: 2, tileRows: 2 })
    expect(tiles).toHaveLength(12)
    expect(tiles.every((tile) => tile.columns <= 2 && tile.rows <= 2)).toBe(true)
    expect(tiles.reduce((area, tile) => area + tile.columns * tile.rows, 0)).toBe(35)
  })

  it('uses continuous threaded rods for every example trip height', () => {
    const config = defaultRackConfig()
    expect([42, 56, 84, 126, 140, 168].every((height) => height < rackHardware(config).m6RodLength)).toBe(true)
    expect(rackHardware(config)).toMatchObject({ m6Rods: 4, m6RodLength: 196, m6Nuts: 32, m4Bolts: 4, m3Bolts: 56 })
  })

  it('provides at least three adjustable shelves', () => {
    const config = { ...defaultRackConfig(), height: 70, shelfCount: 3 }
    expect(rackShelfLevels(config)).toHaveLength(3)
    expect(() => buildRack(wasm, config)).not.toThrow()
  })

  it('presents exact Gridfinity dimensions for ordinary 1x2 holders', () => {
    const dimensions = rackShelfDimensions({ ...defaultRackConfig(), columns: 2, rows: 2 })
    expect(dimensions).toEqual({ width: 83.5, length: 83.5 })
    expect(dimensions.width).toBeGreaterThanOrEqual(41.5)
    expect(dimensions.length).toBeGreaterThanOrEqual(83.5)
  })

  it('uses a descriptive transport-rack filename', () => {
    expect(rackName(defaultRackConfig())).toBe('gridfinity-rack-4x4-196mm-3-shelves')
  })
})
