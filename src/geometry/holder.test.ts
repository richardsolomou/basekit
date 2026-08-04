import { readFileSync } from 'node:fs'
import type { Mesh } from 'manifold-3d'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  buildHolder,
  defaultHolderConfig,
  holderGroup,
  holderLayout,
  holderMagnetPocketCount,
  holderPlan,
  holderSlotMagnetCenters,
  maxHolderMagnetThickness,
  maxHolderSlotDepth,
} from './holder'
import { loadManifold } from './manifold'

let wasm: Awaited<ReturnType<typeof loadManifold>>
let font: Font

beforeAll(async () => {
  wasm = await loadManifold()
  const bytes = readFileSync('src/assets/fonts/oswald-700.woff')
  font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})

function bounds(mesh: Mesh) {
  const { numProp, vertProperties } = mesh
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertProperties.length; i += numProp) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertProperties[i + axis])
      max[axis] = Math.max(max[axis], vertProperties[i + axis])
    }
  }
  return { min, size: max.map((value, axis) => value - min[axis]) }
}

describe('holderLayout', () => {
  it('uses a narrow 1×4 holder for five 32mm models', () => {
    const layout = holderLayout(defaultHolderConfig())
    expect(layout).toMatchObject({ unitsWide: 1, unitsDeep: 4 })
    expect(layout.slotCenters).toHaveLength(5)
  })

  it('moves to a second column when the row limit requires it', () => {
    const config = { ...defaultHolderConfig(), maxColumns: 2, maxRows: 3 }
    expect(holderLayout(config)).toMatchObject({ unitsWide: 2, unitsDeep: 2 })
  })

  it('uses an adaptive staggered lattice for eight 32mm models in 2×3', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 8, { width: 32 })], maxColumns: 2, maxRows: 3 }
    expect(holderLayout(config)).toMatchObject({ unitsWide: 2, unitsDeep: 3 })
    expect(holderLayout(config).slotCenters).toHaveLength(8)
  })

  it('uses two columns for a 50mm model and three for a 90mm model', () => {
    expect(holderLayout({ ...defaultHolderConfig(), groups: [holderGroup('models-1', 1, { width: 50 })] }).unitsWide).toBe(2)
    expect(holderLayout({ ...defaultHolderConfig(), groups: [holderGroup('models-1', 1, { width: 90 })] }).unitsWide).toBe(3)
  })

  it('packs mixed model sizes into one holder', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('models-1', 5, { width: 32 }), holderGroup('models-2', 2, { width: 40 })],
    }
    const layout = holderLayout(config)
    expect(layout.slotCenters.map((slot) => slot.width).sort((a, b) => a - b)).toEqual([32, 32, 32, 32, 32, 40, 40])
  })

  it('uses full base footprints for non-round holder slots', () => {
    const layout = holderLayout({
      ...defaultHolderConfig(),
      groups: [
        holderGroup('bike', 2, { shape: 'oval', width: 60, length: 35 }),
        holderGroup('rank', 3, { shape: 'rect', width: 25, length: 50 }),
      ],
    })
    expect(layout.slotCenters.map((slot) => `${slot.shape}:${slot.width}x${slot.length}`).sort()).toEqual([
      'oval:60x35',
      'oval:60x35',
      'rect:25x50',
      'rect:25x50',
      'rect:25x50',
    ])
  })

  it('uses the supported base magnet layout for each holder slot', () => {
    expect(holderSlotMagnetCenters(holderGroup('models-1', 1, { width: 32 }))).toHaveLength(1)
    const largeRound = holderSlotMagnetCenters(holderGroup('models-1', 1, { width: 65 }))
    expect(largeRound).toHaveLength(3)
    expect(largeRound.every((center) => Math.hypot(center.x, center.y) > 1)).toBe(true)
    const oval = holderSlotMagnetCenters(holderGroup('models-1', 1, { shape: 'oval', width: 60, length: 35 }))
    expect(oval.map((center) => Math.round(center.y))).toEqual([0, 0])
    expect(Math.min(...oval.map((center) => center.x))).toBeLessThan(-20)
    expect(Math.max(...oval.map((center) => center.x))).toBeGreaterThan(20)
    expect(holderSlotMagnetCenters(holderGroup('models-1', 1, { shape: 'oval', width: 90, length: 52 }))).toHaveLength(2)
  })

  it('uses a saved base magnet count for the matching holder slot', () => {
    const oval = holderGroup('models-1', 1, { shape: 'oval', width: 90, length: 52 })
    const config = { ...defaultHolderConfig(), magnetCounts: { 'oval:90x52': 2 } }
    expect(holderSlotMagnetCenters(oval, config)).toHaveLength(2)
  })

  it('matches the five-pocket cross base layout', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('models-1', 1, { width: 60 })],
      magnetCounts: { 'round:60x60': 5 },
      magnets: { ...defaultHolderConfig().magnets, layout: 'five-cross' as const },
    }
    const centers = holderSlotMagnetCenters(config.groups[0], config)
    expect(centers.filter(({ x, y }) => Math.hypot(x, y) < 1e-6)).toHaveLength(1)
    expect(centers).toHaveLength(5)
  })

  it('fits forty 32mm models within a 7×5 box without false overflow', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 40, { width: 32 })] }
    const layout = holderLayout(config)
    expect(layout).toMatchObject({ unitsWide: 6, unitsDeep: 5 })
    expect(layout.slotCenters).toHaveLength(40)
    expect(holderPlan(config).omitted).toEqual([])
  })

  it('fits a large mixed request with structured shelf packing', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('models-1', 34, { width: 32 }), holderGroup('models-2', 2, { width: 40 })],
    }
    expect(holderLayout(config).slotCenters).toHaveLength(36)
    expect(holderPlan(config).omitted).toEqual([])
  })

  it('caps impossible high quantities before packing', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 500, { width: 32 })] }
    const plan = holderPlan(config)
    const fitted = plan.modules.reduce(
      (total, module) => total + module.config.groups.reduce((moduleTotal, group) => moduleTotal + group.quantity, 0),
      0,
    )
    expect(fitted).toBeLessThan(500)
    expect(plan.omitted.reduce((total, group) => total + group.quantity, 0)).toBe(500 - fitted)
  })

  it('keeps a hundred model request bounded by actual holder capacity', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 100, { width: 32 })] }
    expect(holderLayout(config).slotCenters.length).toBeLessThan(100)
    expect(holderPlan(config).omitted.reduce((total, group) => total + group.quantity, 0)).toBeGreaterThan(0)
  })

  it.each([4, 5])('preserves every 50mm recess when rebuilding a planned module for quantity %s', (quantity) => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', quantity, { width: 50 })] }
    const layout = holderLayout(config)
    const module = holderPlan(config).modules[0]
    expect(holderLayout(module.config).slotCenters).toHaveLength(quantity)
    expect(
      layout.slotCenters.every(
        (point) =>
          Math.abs(point.x) <= layout.width / 2 - (point.width + config.slotClearance) / 2 &&
          Math.abs(point.y) <= layout.length / 2 - (point.length + config.slotClearance) / 2,
      ),
    ).toBe(true)
    for (let i = 0; i < layout.slotCenters.length; i++) {
      for (let j = 0; j < i; j++) {
        expect(
          Math.hypot(layout.slotCenters[i].x - layout.slotCenters[j].x, layout.slotCenters[i].y - layout.slotCenters[j].y),
        ).toBeGreaterThanOrEqual(50 + config.slotClearance + config.spacing - 1e-5)
      }
    }
  })

  it('keeps the requested spacing between every pair of models', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('models-1', 5, { width: 32 }), holderGroup('models-2', 2, { width: 40 })],
    }
    const points = holderLayout(config).slotCenters
    for (let i = 0; i < points.length; i++) {
      for (let j = 0; j < i; j++)
        expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThanOrEqual(
          (points[i].width + points[j].width) / 2 + config.slotClearance + config.spacing - 1e-5,
        )
    }
  })

  it('reports no layout when the box constraints are too small', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 2, { width: 90 })], maxColumns: 3, maxRows: 2 }
    expect(holderLayout(config).slotCenters).toHaveLength(0)
  })
})

describe('holderPlan', () => {
  it('reuses a plan for an unchanged configuration', () => {
    const config = defaultHolderConfig()
    expect(holderPlan(config)).toBe(holderPlan(config))
  })

  it('keeps separate miniature groups in reusable modules', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 2,
      maxRows: 4,
      splitGroups: true,
      groups: [holderGroup('unit', 5, { width: 32 }), holderGroup('character', 1, { width: 32 })],
    }
    const plan = holderPlan(config)
    expect(plan.modules.map((module) => module.config.groups[0].id)).toEqual(['unit', 'character'])
    expect(plan.omitted).toEqual([])
  })

  it('reduces the fitted quantity instead of blocking an undersized box', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 1,
      maxRows: 4,
      groups: [holderGroup('unit', 5, { width: 32 }), holderGroup('character', 1, { width: 32 })],
    }
    const plan = holderPlan(config)
    expect(plan.omitted).toEqual([holderGroup('character', 1, { width: 32 })])
  })

  it('keeps earlier groups first when the whole request cannot fit', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 1,
      maxRows: 4,
      groups: [holderGroup('character', 1, { width: 32 }), holderGroup('unit', 5, { width: 32 })],
    }
    expect(holderPlan(config).omitted).toEqual([holderGroup('unit', 2, { width: 32 })])
  })

  it('keeps different sizes together unless splitting is enabled', () => {
    const config = {
      ...defaultHolderConfig(),
      splitGroups: false,
      groups: [holderGroup('unit', 5, { width: 32 }), holderGroup('character', 1, { width: 40 })],
    }
    expect(holderPlan(config).modules).toHaveLength(1)
  })
})

describe('buildHolder', () => {
  it('builds a solid with the exact Gridfinity footprint and requested height', () => {
    const config = defaultHolderConfig()
    const result = buildHolder(wasm, config)
    expect(result.stats.solid).toBe(true)
    expect(bounds(result.mesh).size).toEqual([41.5, 167.5, 14])
  })

  it('has a separate locating foot for every Gridfinity cell', () => {
    const { mesh } = buildHolder(wasm, { ...defaultHolderConfig(), groups: [holderGroup('models-1', 8, { width: 32 })], maxRows: 3 })
    const { numProp, vertProperties } = mesh
    let innerBottomVertices = 0
    for (let i = 0; i < vertProperties.length; i += numProp) {
      if (Math.abs(vertProperties[i]) < 5 && Math.abs(vertProperties[i + 2]) < 1e-6) innerBottomVertices++
    }
    expect(innerBottomVertices).toBeGreaterThan(0)
  })

  it('builds separated modules in their planned box positions', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 2,
      maxRows: 4,
      splitGroups: true,
      groups: [holderGroup('unit', 5, { width: 32 }), holderGroup('character', 1, { width: 32 })],
    }
    expect(bounds(buildHolder(wasm, { ...config, segments: 512 }).mesh).size).toEqual([83.5, 167.5, 14])
    expect(bounds(buildHolder(wasm, config).mesh).size[0]).toBeGreaterThan(83.5)
  })

  it('cuts non-round miniature slots', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('bike', 1, { shape: 'oval', width: 60, length: 35 })],
      maxRows: 1,
    }
    const result = buildHolder(wasm, config, font)
    expect(result.stats.solid).toBe(true)
    expect(bounds(result.mesh).size).toEqual([83.5, 41.5, 14])
  })

  it('separates every module when several share one row', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 4,
      maxRows: 1,
      groups: Array.from({ length: 4 }, (_, index) => holderGroup(`models-${index}`, 1, { width: 32 })),
    }
    expect(bounds(buildHolder(wasm, config).mesh).size[0]).toBeCloseTo(185.5)
  })

  it('opens one flush magnet pocket in the floor of every mini slot', () => {
    const defaults = defaultHolderConfig()
    const config = {
      ...defaults,
      groups: [holderGroup('models-1', 1, { width: 32 })],
      maxRows: 1,
      magnets: { ...defaults.magnets, depthClearance: 0.2 },
    }
    const { mesh } = buildHolder(wasm, config)
    const { numProp, vertProperties } = mesh
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const slotFloor = config.height - config.slotDepth
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < vertProperties.length; i += numProp) {
      if (Math.hypot(vertProperties[i], vertProperties[i + 1]) <= pocketRadius + 0.05) {
        minZ = Math.min(minZ, vertProperties[i + 2])
        maxZ = Math.max(maxZ, vertProperties[i + 2])
      }
    }
    expect(minZ).toBeCloseTo(slotFloor - config.magnets.thickness - config.magnets.depthClearance, 2)
    expect(maxZ).toBeCloseTo(slotFloor, 2)
  })

  it('cuts every default magnet pocket for larger supported bases', () => {
    const config = { ...defaultHolderConfig(), groups: [holderGroup('models-1', 2, { width: 65 })], maxRows: 2 }
    expect(holderMagnetPocketCount(config)).toBe(6)
    expect(buildHolder(wasm, config).stats.solid).toBe(true)
  })

  it.each([
    { name: 'engraving', config: { ...defaultHolderConfig(), magnets: { ...defaultHolderConfig().magnets, enabled: false } } },
    { name: 'magnets', config: defaultHolderConfig() },
  ])('rejects slots that cut through the Gridfinity foot with $name', ({ config }) => {
    const maxDepth = maxHolderSlotDepth(config)
    expect(buildHolder(wasm, { ...config, slotDepth: maxDepth }, font).stats.solid).toBe(true)
    expect(() => buildHolder(wasm, { ...config, slotDepth: maxDepth + 0.01 }, font)).toThrow(
      'Slots leave too little material above the Gridfinity foot',
    )
  })

  it('limits magnet thickness to the material above the Gridfinity foot', () => {
    const config = defaultHolderConfig()
    expect(maxHolderMagnetThickness(config)).toBeCloseTo(5.85)
  })

  it.each(['slots', 'module'] as const)('subtracts size engraving %s', (placement) => {
    const config = defaultHolderConfig()
    const plain = buildHolder(wasm, { ...config, engraving: { ...config.engraving, enabled: false } }, font).stats.volume
    const engraved = buildHolder(wasm, { ...config, engraving: { enabled: true, placement } }, font).stats.volume
    expect(engraved).toBeLessThan(plain)
  })

  it('places in-slot engraving around multi-pocket magnet layouts', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [holderGroup('models-1', 1, { width: 65 })],
      maxRows: 2,
      engraving: { enabled: true, placement: 'slots' as const },
    }
    const plain = buildHolder(wasm, { ...config, engraving: { ...config.engraving, enabled: false } }, font).stats.volume
    const engraved = buildHolder(wasm, config, font).stats.volume
    expect(holderMagnetPocketCount(config)).toBe(3)
    expect(engraved).toBeLessThan(plain)
  })
})
