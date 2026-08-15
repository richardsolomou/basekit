import { beforeAll, describe, expect, it } from 'vitest'
import { splitMeshComponents } from './exporters'
import { loadManifold } from './manifold'
import {
  buildRack,
  defaultRackConfig,
  rackConnectionDimensions,
  rackDimensions,
  rackHardware,
  rackName,
  rackBeamPositions,
  rackPuzzleJointCount,
  rackReceiverProfile,
  rackShelfDimensions,
  rackShelfLevels,
  rackStructuralAnalysis,
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
    expect(result.stats.volume).toBeLessThan(1_200_000)
    const rack = new wasm.Manifold(result.mesh)
    const parts = rack.decompose()
    expect(parts.length).toBeGreaterThan(2 + config.shelfCount)
    expect(splitMeshComponents(result.mesh)).toHaveLength(parts.length)
    expect(rack.boundingBox().min[2]).toBeCloseTo(0)
    for (const part of parts) part.delete()
    rack.delete()
  })

  it('shows the finished rack assembled without changing the exportable parts', () => {
    const config = defaultRackConfig()
    const assembled = buildRack(wasm, config)
    expect(assembled.stats.solid).toBe(true)
    expect(rackDimensions(config).height).toBe(126)
    expect(rackDimensions({ ...config, view: 'print' }).height).toBe(40)
  })

  it('splits a 7x5 shelf into printer-sized interconnecting tiles', () => {
    const tiles = rackTiles({ ...defaultRackConfig(), columns: 7, rows: 5, tileColumns: 2, tileRows: 2 })
    expect(tiles).toHaveLength(12)
    expect(tiles.every((tile) => tile.columns <= 2 && tile.rows <= 2)).toBe(true)
    expect(tiles.reduce((area, tile) => area + tile.columns * tile.rows, 0)).toBe(35)
    expect(rackPuzzleJointCount(defaultRackConfig())).toBe(58)
  })

  it('requires no purchased hardware', () => {
    const config = defaultRackConfig()
    expect(rackHardware(config)).toMatchObject({
      printedUprights: 4,
      printedAnchors: 4,
      printedShelfRails: 4,
      printedShelfCollars: 8,
      printedSpliceSleeves: 12,
      printedLockPins: 8,
      purchasedParts: 0,
    })
  })

  it('provides at least three adjustable shelves', () => {
    const config = { ...defaultRackConfig(), height: 84, shelfCount: 3 }
    expect(rackShelfLevels(config).length).toBeGreaterThanOrEqual(3)
    expect(() => buildRack(wasm, config)).not.toThrow()
  })

  it('presents exact Gridfinity dimensions for ordinary 1x2 holders', () => {
    const dimensions = rackShelfDimensions({ ...defaultRackConfig(), columns: 2, rows: 2 })
    expect(dimensions).toEqual({ width: 84, length: 84 })
    expect(dimensions.width).toBeGreaterThanOrEqual(41.5)
    expect(dimensions.length).toBeGreaterThanOrEqual(83.5)
  })

  it('uses the canonical holder foot as its receiving profile', () => {
    const config = defaultRackConfig()
    expect(rackReceiverProfile(config)).toEqual([
      { depth: 0, size: 41.65 },
      { depth: 2.15, size: 37.35 },
      { depth: 3.95, size: 37.35 },
      { depth: 4.75, size: 35.75 },
    ])
    expect(config.shelfThickness - 4.75).toBeGreaterThanOrEqual(0.8)
  })

  it('keeps structural rails outside the usable floor', () => {
    expect(rackBeamPositions({ ...defaultRackConfig(), columns: 7, rows: 5, tileRows: 2 })).toEqual([-119, 119])
  })

  it('keeps deep supports out of every Gridfinity cell', () => {
    const config = defaultRackConfig()
    const result = buildRack(wasm, config)
    expect(rackDimensions({ ...config, view: 'print' }).height).toBe(40)
    expect(config.shelfThickness).toBe(15)
    expect(result.stats.solid).toBe(true)
  })

  it('captures floors and rail joints with positive engagement', () => {
    const dimensions = rackConnectionDimensions(defaultRackConfig())
    expect(dimensions.puzzleHeight).toBeLessThan(dimensions.materialBelowSocket)
    expect(dimensions.puzzleRoof).toBeGreaterThanOrEqual(5)
    expect(dimensions.tongueEngagement).toBeGreaterThanOrEqual(4)
    expect(dimensions.collarRailInsert).toBeGreaterThanOrEqual(5)
    expect(dimensions.collarBearing).toBeGreaterThanOrEqual(3)
    expect(dimensions.spliceOverlap).toBeGreaterThanOrEqual(18)
    expect(dimensions.pinClearance).toBeCloseTo(0.5)
  })

  it('screens the maximum rack at transport shock load', () => {
    const maximum = { ...defaultRackConfig(), columns: 7, rows: 5, designLoadKg: 3 }
    expect(rackStructuralAnalysis(maximum)).toMatchObject({ passes: true })
    expect(rackStructuralAnalysis(maximum).safetyFactor).toBeGreaterThanOrEqual(2)
    expect(rackStructuralAnalysis(maximum).deflection).toBeLessThanOrEqual(1)
    expect(rackStructuralAnalysis(maximum).railDeflection).toBeLessThanOrEqual(1)
    expect(rackStructuralAnalysis(maximum).floorDeflection).toBeLessThanOrEqual(1)
    expect(rackStructuralAnalysis(maximum).pinStress).toBeLessThan(2)
    expect(rackStructuralAnalysis(maximum).puzzleStress).toBeLessThan(1)
    expect(rackStructuralAnalysis(maximum).collarBearingStress).toBeLessThan(0.3)
    const excessive = { ...maximum, designLoadKg: 20 }
    expect(rackStructuralAnalysis(excessive).passes).toBe(false)
    expect(() => buildRack(wasm, excessive)).toThrow(/design screen/)
  })

  it('uses a descriptive transport-rack filename', () => {
    expect(rackName(defaultRackConfig())).toBe('gridfinity-box-floors-7x5-126mm-2-levels')
  })
})
