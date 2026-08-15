import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import { buildRack, defaultRackConfig, rackName, rackShelfDimensions, rackSlotLevels } from './rack'

let wasm: Awaited<ReturnType<typeof loadManifold>>

beforeAll(async () => {
  wasm = await loadManifold()
})

describe('transport rack', () => {
  it('builds two frames, interchangeable shelves, and one reusable retainer', () => {
    const config = defaultRackConfig()
    const result = buildRack(wasm, config)
    expect(result.stats.solid).toBe(true)
    const rack = new wasm.Manifold(result.mesh)
    const parts = rack.decompose()
    expect(parts).toHaveLength(2 + config.shelfCount + 1)
    expect(rack.boundingBox().min[2]).toBeCloseTo(0)
    for (const part of parts) part.delete()
    rack.delete()
  })

  it('provides both example trip arrangements with the same 14mm frame', () => {
    const levels = rackSlotLevels(defaultRackConfig())
    expect(levels).toEqual(expect.arrayContaining([42, 84, 140, 56, 126, 168]))
  })

  it('provides at least three positions and shelves', () => {
    const config = { ...defaultRackConfig(), height: 70, shelfCount: 3 }
    expect(rackSlotLevels(config).length).toBeGreaterThanOrEqual(3)
    expect(() => buildRack(wasm, config)).not.toThrow()
  })

  it('presents exact Gridfinity dimensions for ordinary 1x2 holders', () => {
    const dimensions = rackShelfDimensions({ ...defaultRackConfig(), columns: 2, rows: 2 })
    expect(dimensions).toEqual({ width: 83.5, length: 83.5 })
    expect(dimensions.width).toBeGreaterThanOrEqual(41.5)
    expect(dimensions.length).toBeGreaterThanOrEqual(83.5)
  })

  it('uses a descriptive transport-rack filename', () => {
    expect(rackName(defaultRackConfig())).toBe('gridfinity-rack-4x4-196mm-4-shelves')
  })
})
