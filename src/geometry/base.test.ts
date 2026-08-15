import { readFileSync } from 'node:fs'
import type { Mesh } from 'manifold-3d'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildBase, magnetPositions, ribAngles, trayCompatibleMagnetCounts } from './base'
import { toStl } from './exporters'
import { LABEL_MARGIN, pointInContours } from './label'
import { loadManifold } from './manifold'
import { baseOutline, defaultLabel, trimNumber } from './outline'
import { maxProfileSize, profileSteps } from './profile'
import {
  automaticMagnetCount,
  MAGNET_CHOICES,
  OVAL_SIZES,
  PILL_SIZES,
  POLYGON_SIZES,
  presetFor,
  RECT_SIZES,
  resized,
  RIB_CHOICES,
  ROUND_SIZES,
  type SizePreset,
} from './presets'
import { EXPORT_CURVE_TOLERANCE, exportSegmentsFor, previewSegmentsFor } from './quality'
import type { BaseConfig } from './types'

const FONT_PATH = 'src/assets/fonts/oswald-700.woff'
const ROUND_32 = ROUND_SIZES[2]

let wasm: Awaited<ReturnType<typeof loadManifold>>
let font: Font

beforeAll(async () => {
  wasm = await loadManifold()
  const bytes = readFileSync(FONT_PATH)
  font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})

function bounds(mesh: Mesh) {
  const { numProp, vertProperties: v } = mesh
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += numProp) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], v[i + axis])
      max[axis] = Math.max(max[axis], v[i + axis])
    }
  }
  return { min, max, size: max.map((m, i) => m - min[i]) }
}

/** Measures the bore around a magnet centre: solid material contributes no vertices there. */
function pocketAt(mesh: Mesh, cx: number, cy: number, pocketRadius: number) {
  const { numProp, vertProperties: v } = mesh
  let vertices = 0
  let minZ = Infinity
  let maxZ = -Infinity
  let maxRadius = 0
  for (let i = 0; i < v.length; i += numProp) {
    const r = Math.hypot(v[i] - cx, v[i + 1] - cy)
    if (r > pocketRadius + 0.05) continue
    vertices++
    minZ = Math.min(minZ, v[i + 2])
    maxZ = Math.max(maxZ, v[i + 2])
    maxRadius = Math.max(maxRadius, r)
  }
  return { vertices, minZ, maxZ, maxRadius }
}

/** Widest point of the bottom face, which the edge profile pulls inwards. */
function bottomReach(mesh: Mesh) {
  const { numProp, vertProperties: v } = mesh
  let widest = 0
  for (let i = 0; i < v.length; i += numProp) {
    if (Math.abs(v[i + 2]) < 1e-6) widest = Math.max(widest, Math.hypot(v[i], v[i + 1]))
  }
  return widest
}

const build = (config: BaseConfig) => buildBase(wasm, config, font)
const preset = (p: SizePreset) => presetFor(p)

describe('buildBase', () => {
  it('matches the requested diameter at the top face', () => {
    expect(bounds(build(preset(ROUND_32)).mesh).size[0]).toBeCloseTo(32, 1)
  })

  it('matches the requested height', () => {
    expect(bounds(build(preset(ROUND_32)).mesh).size[2]).toBeCloseTo(4, 5)
  })

  it('thickens the floor for bases 65mm and over without reducing the magnet recess', () => {
    expect(presetFor(ROUND_SIZES[5])).toMatchObject({ height: 4, floorThickness: 1 })
    expect(presetFor(ROUND_SIZES[6])).toMatchObject({ height: 4.5, floorThickness: 1.5 })
    expect(presetFor(OVAL_SIZES[2])).toMatchObject({ height: 4, floorThickness: 1 })
    expect(presetFor(OVAL_SIZES[3])).toMatchObject({ height: 4.5, floorThickness: 1.5 })
  })

  it('sits on the build plate', () => {
    expect(bounds(build(preset(ROUND_SIZES[4])).mesh).min[2]).toBeCloseTo(0, 5)
  })

  it('tapers the bottom face inwards by the profile size', () => {
    const config = { ...preset(ROUND_SIZES[3]), profile: 'taper' as const, profileSize: 1 }
    expect(bottomReach(build(config).mesh)).toBeCloseTo(19, 1)
  })

  it('leaves the bottom face at full size when the edge is straight', () => {
    const config = { ...preset(ROUND_SIZES[3]), profile: 'straight' as const }
    expect(bottomReach(build(config).mesh)).toBeCloseTo(20, 1)
  })

  it('reports a volume well under the solid cylinder it came from', () => {
    const config = preset(ROUND_32)
    const { stats } = build(config)
    expect(stats.volume).toBeLessThan(Math.PI * 16 ** 2 * config.height)
    expect(stats.volume).toBeGreaterThan(0)
  })

  it('drills a pocket at every magnet position, open at the top face so the magnet sits flush', () => {
    // Ribs are aimed at the bosses, so they are switched off to isolate the bore.
    const base = preset(ROUND_SIZES[4])
    const config = { ...base, ribs: { ...base.ribs, count: 0 } }
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const { mesh } = build(config)
    const bossRadius = pocketRadius + config.magnets.bossWall
    const positions = magnetPositions(
      config.magnets.count,
      config.width / 2 - config.wallThickness,
      config.length / 2 - config.wallThickness,
      bossRadius + LABEL_MARGIN,
    )

    for (const [i, position] of positions.entries()) {
      const pocket = pocketAt(mesh, position.x, position.y, pocketRadius)
      expect(pocket.vertices, `pocket ${i}`).toBeGreaterThan(0)
      // Cut down from the top face by the magnet thickness plus its fit clearance,
      // so the magnet can finish flush without bottoming out.
      expect(pocket.minZ, `pocket ${i} floor`).toBeCloseTo(config.height - config.magnets.thickness - config.magnets.depthClearance, 5)
      expect(pocket.maxZ, `pocket ${i} opening`).toBeCloseTo(config.height, 5)
      expect(pocket.maxRadius, `pocket ${i} bore`).toBeCloseTo(pocketRadius, 2)
    }
  })

  it.each([1, 1.5, 2, 3])('keeps a %dmm magnet flush with the top of its boss', (thickness) => {
    const base = preset(ROUND_SIZES[4])
    const config = {
      ...base,
      ribs: { ...base.ribs, count: 0 },
      magnets: { ...base.magnets, thickness, depthClearance: 0 },
    }
    const ringRadius = (config.width / 2 - config.wallThickness) / 2
    const bore = (config.magnets.diameter + config.magnets.clearance) / 2

    const pocket = pocketAt(build(config).mesh, 0, ringRadius, bore)
    expect(pocket.maxZ).toBeCloseTo(config.height, 5)
    expect(pocket.maxZ - pocket.minZ).toBeCloseTo(thickness, 5)
  })

  it('adds depth clearance behind a flush magnet pocket', () => {
    const base = preset(ROUND_SIZES[4])
    const config = { ...base, ribs: { ...base.ribs, count: 0 }, magnets: { ...base.magnets, depthClearance: 0.2 } }
    const ringRadius = (config.width / 2 - config.wallThickness) / 2
    const bore = (config.magnets.diameter + config.magnets.clearance) / 2
    const pocket = pocketAt(build(config).mesh, 0, ringRadius, bore)

    expect(pocket.maxZ - pocket.minZ).toBeCloseTo(config.magnets.thickness + config.magnets.depthClearance, 5)
  })

  it('leaves the centre unbored when magnets are turned off', () => {
    // Ribs and the label would both put geometry at the centre on their own.
    const base = preset(ROUND_SIZES[3])
    const { mesh } = build({
      ...base,
      magnets: { ...base.magnets, count: 0 },
      ribs: { ...base.ribs, count: 0 },
      label: { ...base.label, enabled: false },
    })
    // Only the loft's own vertices remain; a pocket would ring the centre at the bore radius.
    expect(pocketAt(mesh, 0, 0, (base.magnets.diameter + base.magnets.clearance) / 2).maxRadius).toBeLessThan(0.01)
  })

  it('uses a centre and four outer pockets for the five-pocket cross layout', () => {
    const positions = magnetPositions(1, 30, 30, 4, { layout: 'five-cross' })
    expect(positions.filter(({ x, y }) => Math.hypot(x, y) < 1e-6)).toHaveLength(1)
    expect(positions.filter(({ x, y }) => Math.hypot(x, y) > 1e-6)).toHaveLength(4)
  })

  it.for([RECT_SIZES[0], RECT_SIZES[1], ROUND_SIZES[0], ROUND_SIZES[1]])('still fits a size label on a cramped $label base', (size) => {
    // The well of a small base is mostly boss and ribs, and the label used to be
    // dropped silently when the first direction tried had no room.
    const config = preset(size)
    const plain = { ...config, label: { ...config.label, enabled: false } }
    expect(build(config).stats.volume).toBeGreaterThan(build(plain).stats.volume)
  })

  it('adds material for the embossed label', () => {
    const config = preset(ROUND_SIZES[3])
    const plain = { ...config, label: { ...config.label, enabled: false } }
    expect(build(config).stats.volume).toBeGreaterThan(build(plain).stats.volume)
  })

  it.for([0, 2, 3, 4, 6])('builds a solid with %i ribs', (count) => {
    const config = preset(ROUND_SIZES[4])
    expect(build({ ...config, ribs: { ...config.ribs, count } }).stats.solid).toBe(true)
  })

  it.for(['taper', 'straight', 'bevel', 'round'] as const)('builds a solid with a %s bottom edge', (profile) => {
    expect(build({ ...preset(ROUND_32), profile }).stats.solid).toBe(true)
  })

  it.for(['taper', 'straight', 'bevel', 'round'] as const)('holds the full size with a %s bottom edge', (profile) => {
    expect(bounds(build({ ...preset(ROUND_32), profile }).mesh).size[0]).toBeCloseTo(32, 1)
  })

  it.for(ROUND_SIZES)('builds a solid $label mm round base', (size) => {
    expect(build(preset(size)).stats.solid).toBe(true)
  })

  it.for(ROUND_SIZES)('measures $label mm across', (size) => {
    expect(bounds(build(preset(size)).mesh).size[0]).toBeCloseTo(size.width, 1)
  })

  it.for(OVAL_SIZES)('builds a solid $label oval', (size) => {
    expect(build(preset(size)).stats.solid).toBe(true)
  })

  it.for(OVAL_SIZES)('measures $label across both axes', (size) => {
    const { size: extents } = bounds(build(preset(size)).mesh)
    expect(extents[0]).toBeCloseTo(size.width, 1)
    expect(extents[1]).toBeCloseTo(size.length ?? size.width, 1)
  })

  it.for(RECT_SIZES)('builds a solid $label rank base', (size) => {
    expect(build(preset(size)).stats.solid).toBe(true)
  })

  it.for(RECT_SIZES)('measures $label as frontage by depth', (size) => {
    const { size: extents } = bounds(build(preset(size)).mesh)
    expect(extents[0]).toBeCloseTo(size.width, 1)
    expect(extents[1]).toBeCloseTo(size.length ?? size.width, 1)
  })

  it.for(PILL_SIZES)('builds a solid $label pill', (size) => {
    expect(build(preset(size)).stats.solid).toBe(true)
  })

  it.for(POLYGON_SIZES)('builds a solid $label hex', (size) => {
    expect(build(preset(size)).stats.solid).toBe(true)
  })

  it('keeps a hex inside the round it replaces', () => {
    // Width is across the corners, so it fits the same space as that diameter.
    const { size } = bounds(build(preset(POLYGON_SIZES[1])).mesh)
    expect(size[0]).toBeCloseTo(32, 1)
    expect(size[1]).toBeLessThanOrEqual(32.01)
  })

  it('builds a pill with the requested extents', () => {
    const config = { ...preset(ROUND_32), shape: 'pill' as const, width: 60, length: 30 }
    const { size } = bounds(build(config).mesh)
    expect(size[0]).toBeCloseTo(60, 1)
    expect(size[1]).toBeCloseTo(30, 1)
  })

  it('builds a rounded rectangle with the requested extents', () => {
    const config = { ...preset(ROUND_32), shape: 'rect' as const, width: 50, length: 30, cornerRadius: 4 }
    const { size } = bounds(build(config).mesh)
    expect(size[0]).toBeCloseTo(50, 1)
    expect(size[1]).toBeCloseTo(30, 1)
  })

  it('builds a square when a rect is given equal extents', () => {
    const config = { ...preset(ROUND_32), shape: 'rect' as const, width: 40, length: 40, cornerRadius: 0 }
    const { size } = bounds(build(config).mesh)
    expect(size[0]).toBeCloseTo(40, 2)
    expect(size[1]).toBeCloseTo(40, 2)
  })

  it.for([3, 5, 6, 8])('builds a solid %i-sided polygon base', (sides) => {
    const config = { ...preset(ROUND_SIZES[4]), shape: 'polygon' as const, sides }
    expect(build(config).stats.solid).toBe(true)
  })

  it('spreads magnets along the long axis of an elongated base', () => {
    const base = preset(OVAL_SIZES[0]) // 60x35
    const config = { ...base, magnets: { ...base.magnets, count: 3 }, ribs: { ...base.ribs, count: 0 } }
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const { mesh } = build(config)
    // The outer two sit off-centre on X with Y still on the axis.
    const centre = pocketAt(mesh, 0, 0, pocketRadius)
    expect(centre.vertices).toBeGreaterThan(0)
    const reach = magnetPositions(
      config.magnets.count,
      config.width / 2 - config.wallThickness,
      config.length / 2 - config.wallThickness,
      pocketRadius + config.magnets.bossWall + LABEL_MARGIN,
      { ellipticalRow: true },
    )[0].x
    expect(pocketAt(mesh, reach, 0, pocketRadius).vertices).toBeGreaterThan(0)
  })

  it('caps the automatic magnet count for a large oval', () => {
    expect(presetFor(OVAL_SIZES[3], 2).magnets.count).toBe(2)
  })

  it.for([ROUND_SIZES[1], ROUND_SIZES[4], ROUND_SIZES[9], OVAL_SIZES[0], OVAL_SIZES[2]])('welds cleanly on a $label base', (size) => {
    // Two vertices at one position mean surfaces meet tangentially, which pinches
    // into a non-manifold edge in any tool that merges vertices by position.
    const { mesh } = build(preset(size))
    const seen = new Set<string>()
    let duplicates = 0
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      const key = `${mesh.vertProperties[i]},${mesh.vertProperties[i + 1]},${mesh.vertProperties[i + 2]}`
      if (seen.has(key)) duplicates++
      seen.add(key)
    }
    expect(duplicates).toBe(0)
  })

  it('rejects walls that leave no room inside', () => {
    expect(() => build({ ...preset(ROUND_SIZES[0]), wallThickness: 20 })).toThrow(/no room inside/)
  })

  it('rejects a wall thicker than a narrow polygon can carry', () => {
    // A triangle's inradius is far under its bounding box, so a wall the round
    // sizes shrug off offsets this one away to nothing. That used to leave the
    // well bounds infinite and hang the build allocating rib obstacles.
    const config = { ...preset(POLYGON_SIZES[0]), sides: 3, width: 15, length: 15, wallThickness: 6 }
    expect(() => build(config)).toThrow(/no room inside/)
  })

  it('rejects a floor that leaves no well', () => {
    const config = preset(ROUND_32)
    expect(() => build({ ...config, floorThickness: config.height })).toThrow(/No room left for a well/)
  })

  it('rejects an edge profile that cuts through the wall at the well floor', () => {
    const config = { ...preset(ROUND_32), profileSize: 3, floorThickness: 0.4 }
    expect(() => build(config)).toThrow(/Edge profile leaves too little wall at the well floor/)
  })

  it('accepts the UI limit for a round edge in an export mesh', () => {
    const base = { ...preset(ROUND_32), profile: 'round' as const, floorThickness: 0.4 }
    const profileSize = Math.floor(maxProfileSize(base) * 10) / 10
    const config = { ...base, profileSize, segments: exportSegmentsFor(base.width) }
    expect(() => build(config)).not.toThrow()
  })
})

describe('labels', () => {
  it('keeps a half millimetre size intact', () => {
    expect(trimNumber(28.5)).toBe('28.5')
  })

  it('drops a trailing zero', () => {
    expect(trimNumber(32)).toBe('32')
  })

  it('names a round base by its diameter', () => {
    expect(defaultLabel(presetFor(ROUND_SIZES[1]))).toBe('28.5')
  })

  it('names an oval by both extents', () => {
    expect(defaultLabel(presetFor(OVAL_SIZES[0]))).toBe('60x35')
  })

  it('embosses the exact half millimetre size', () => {
    // 28.5 would read "29" if the label were rounded, so the glyph count differs.
    const config = presetFor(ROUND_SIZES[1])
    const plain = { ...config, label: { ...config.label, enabled: false } }
    expect(build(config).stats.volume).toBeGreaterThan(build(plain).stats.volume)
  })
})

describe('curve tolerance', () => {
  it.each([15, 32, 180])('keeps an exported %dmm curve within 1µm of true', (diameter) => {
    const segments = exportSegmentsFor(diameter)
    const error = (diameter / 2) * (1 - Math.cos(Math.PI / segments))
    expect(error).toBeLessThanOrEqual(EXPORT_CURVE_TOLERANCE)
  })

  it('uses fewer segments in the preview', () => {
    expect(previewSegmentsFor(180)).toBeLessThan(exportSegmentsFor(180))
  })

  it('keeps an exported round edge profile within 1µm of true', () => {
    const radius = 3
    const arcSegments = profileSteps(4, 'round', radius, EXPORT_CURVE_TOLERANCE).length - 2
    const error = radius * (1 - Math.cos(Math.PI / (4 * arcSegments)))
    expect(error).toBeLessThanOrEqual(EXPORT_CURVE_TOLERANCE)
  })
})

describe('toStl', () => {
  it('writes one 50-byte record per triangle', () => {
    const { mesh, stats } = build(preset(ROUND_32))
    const stl = toStl(mesh)
    expect(stl.byteLength).toBe(84 + stats.triangles * 50)
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(stats.triangles)
  })
})

describe('rib placement', () => {
  /** Perpendicular distance from a boss centre to a spoke's axis through the origin. */
  function clearance(angle: number, boss: { x: number; y: number }): number {
    return Math.abs(-Math.sin(angle) * boss.x + Math.cos(angle) * boss.y)
  }

  function layout(size: SizePreset) {
    const config = presetFor(size)
    const bossRadius = config.magnets.diameter / 2 + config.magnets.clearance / 2 + config.magnets.bossWall
    const magnets = magnetPositions(config.magnets.count, config.width / 2, config.length / 2, bossRadius)
    return {
      spokes: ribAngles(config.ribs.count, magnets),
      bosses: magnets.filter((m) => Math.hypot(m.x, m.y) > 1e-6),
    }
  }

  const sizes: SizePreset[] = [...ROUND_SIZES, ...POLYGON_SIZES, ...OVAL_SIZES, ...PILL_SIZES, ...RECT_SIZES]

  it.each(sizes.map((size) => [`${size.shape} ${size.label}`, size] as const))('runs a spoke through a boss on a %s', (_name, size) => {
    const { spokes, bosses } = layout(size)
    if (bosses.length === 0) return
    expect(bosses.every((boss) => spokes.some((angle) => clearance(angle, boss) < 1e-9))).toBe(true)
  })

  it('lines every spoke up with a boss when the counts match', () => {
    const magnets = magnetPositions(3, 30, 30, 4)
    const { length } = magnets
    expect(length).toBe(3)
    for (const boss of magnets) {
      expect(ribAngles(3, magnets).some((angle) => clearance(angle, boss) < 1e-9)).toBe(true)
    }
  })

  it('reaches both bosses of a row down a long base', () => {
    // Elongated footprints put magnets in a line, not a ring: bearings 0 and 180.
    const magnets = magnetPositions(3, 45, 17.5, 4).filter((m) => Math.hypot(m.x, m.y) > 1e-6)
    expect(magnets).toHaveLength(2)
    const spokes = ribAngles(4, magnetPositions(3, 45, 17.5, 4))
    for (const boss of magnets) {
      expect(spokes.some((angle) => clearance(angle, boss) < 1e-9)).toBe(true)
    }
  })

  it('leaves the spokes upright when the only magnet is central', () => {
    expect(ribAngles(3, magnetPositions(1, 16, 16, 4))[0]).toBeCloseTo(Math.PI / 2, 6)
  })

  it('gussets every boss across custom row boundaries', () => {
    for (let short = 20; short <= 120; short += 5) {
      for (let long = short * 1.36; long <= 180; long += 5) {
        const config = resized(presetFor(OVAL_SIZES[0]), long, short)
        const bossRadius = config.magnets.diameter / 2 + config.magnets.clearance / 2 + config.magnets.bossWall
        const magnets = magnetPositions(config.magnets.count, long / 2, short / 2, bossRadius)
        const spokes = ribAngles(config.ribs.count, magnets)
        expect(magnets.every((boss) => spokes.some((angle) => clearance(angle, boss) < 1e-9))).toBe(true)
      }
    }
  })
})

describe('tray-compatible magnet placement', () => {
  const pitch = 15
  const rowPitch = (pitch * Math.sqrt(3)) / 2
  const isLatticeNode = ({ x, y }: { x: number; y: number }) => {
    const row = y / rowPitch
    const column = x / pitch - row / 2
    return Math.abs(row - Math.round(row)) < 1e-6 && Math.abs(column - Math.round(column)) < 1e-6
  }

  it.each([1, 2, 3, 4, 5, 6, 8])('places all %s round-base magnets on the canonical staggered lattice', (count) => {
    const magnets = magnetPositions(count, 90, 90, 4, { layout: 'lattice', latticePitch: pitch })
    expect(magnets).toHaveLength(count)
    expect(magnets.every(isLatticeNode)).toBe(true)
  })

  it.each([1, 2, 4, 6, 8])('places all %s elongated-base magnets on the canonical staggered lattice', (count) => {
    const magnets = magnetPositions(count, 90, 30, 4, { layout: 'lattice', latticePitch: pitch })
    expect(magnets).toHaveLength(count)
    expect(magnets.every(isLatticeNode)).toBe(true)
  })

  it('runs a rib through every tray-compatible magnet boss', () => {
    const magnets = magnetPositions(8, 90, 90, 4, { layout: 'lattice', latticePitch: pitch })
    const spokes = ribAngles(8, magnets, true)
    const clearance = (angle: number, boss: { x: number; y: number }) => Math.abs(-Math.sin(angle) * boss.x + Math.cos(angle) * boss.y)
    expect(magnets.every((boss) => spokes.some((angle) => clearance(angle, boss) < 1e-6))).toBe(true)
  })

  it('rejects a pitch that cannot fit the requested magnets', () => {
    expect(() => magnetPositions(3, 20, 20, 4, { layout: 'lattice', latticePitch: 20 })).toThrow('Tray-compatible magnet pitch is too wide')
  })

  it.each([...ROUND_SIZES, ...POLYGON_SIZES, ...OVAL_SIZES, ...PILL_SIZES, ...RECT_SIZES].map((size) => [size.label, size] as const))(
    'builds the standard %s footprint with its tray-compatible automatic count',
    (_label, size) => {
      const config = presetFor(size)
      config.magnets.layout = 'lattice'
      config.magnets.count = trayCompatibleMagnetCounts(config).findLast((count) => count <= config.magnets.count)!
      expect(buildBase(wasm, config, font).stats.solid).toBe(true)
    },
  )
})

describe('scaling with the footprint', () => {
  const rounds = ROUND_SIZES.map((size) => presetFor(size))

  it('never reduces the magnet count as the base grows', () => {
    const counts = rounds.map((c) => c.magnets.count)
    expect(counts).toStrictEqual([...counts].sort((a, b) => a - b))
  })

  it('holds a titanic base with more than the four magnets that used to be the ceiling', () => {
    const biggest = rounds.at(-1)
    expect(biggest?.magnets.count).toBeGreaterThan(4)
  })

  it('uses an end pair on a 90×52 oval without weakening larger rows', () => {
    expect(presetFor(OVAL_SIZES[2]).magnets.count).toBe(2)
    expect(presetFor(OVAL_SIZES[3]).magnets.count).toBe(4)
  })

  it('keeps automatic balanced rings on their supported counts', () => {
    expect(presetFor(ROUND_SIZES[9])).toMatchObject({ magnets: { count: 5 }, ribs: { count: 5 } })
    expect(presetFor(ROUND_SIZES[8])).toMatchObject({ magnets: { count: 4 }, ribs: { count: 4 } })
    expect(presetFor(OVAL_SIZES[4])).toMatchObject({ magnets: { count: 4 }, ribs: { count: 4 } })
  })

  it('preserves odd rings for legacy geometry', () => {
    expect(presetFor(ROUND_SIZES[9], 8, 1)).toMatchObject({ magnets: { count: 5, patternVersion: 1 }, ribs: { count: 5 } })
  })

  it('uses an end pair when a low-area custom base has a long lever arm', () => {
    expect(resized(presetFor(OVAL_SIZES[0]), 80, 20).magnets.count).toBe(2)
    expect(resized(presetFor(OVAL_SIZES[0]), 50, 25).magnets.count).toBe(1)
  })

  it('updates size-driven construction defaults when a custom footprint crosses 65mm', () => {
    const large = resized(presetFor(ROUND_SIZES[2]), 65, 65)
    expect(large).toMatchObject({ height: 4.5, floorThickness: 1.5 })
    expect(resized(large, 60, 60)).toMatchObject({ height: 4, floorThickness: 1 })
  })

  it('preserves manually changed construction values while resizing', () => {
    const base = { ...presetFor(ROUND_SIZES[2]), height: 5, floorThickness: 1.3 }
    expect(resized(base, 65, 65)).toMatchObject({ height: 5, floorThickness: 1.3 })
  })

  it('uses the lower supported row count when transverse demand falls between counts', () => {
    const base = presetFor(OVAL_SIZES[0])
    expect(resized(base, 90, 70).magnets.count).toBe(3)
    expect(resized(base, 95, 70).magnets.count).toBe(4)
    expect(resized(base, 142, 105).magnets.count).toBe(4)
  })

  it('keeps every automatic row count even', () => {
    const odd: string[] = []
    for (let short = 20; short <= 120; short += 5) {
      for (let long = short * 1.36; long <= 180; long += 5) {
        const count = resized(presetFor(OVAL_SIZES[0]), long, short).magnets.count
        if (count > 1 && count % 2 !== 0) odd.push(`${long}×${short}: ${count}`)
      }
    }
    expect(odd).toEqual([])
  })

  it('adjusts automatic counts for magnet strength without weakening stability', () => {
    expect(automaticMagnetCount(80, 80, 8, 3, 1)).toBe(8)
    expect(automaticMagnetCount(80, 80, 8, 5, 2)).toBe(4)
    expect(automaticMagnetCount(80, 80, 8, 6, 3)).toBe(3)
    expect(automaticMagnetCount(50, 50, 8, 8, 4)).toBe(3)
  })

  it('never reduces the magnet count as an elongated row grows', () => {
    const base = presetFor(OVAL_SIZES[0])
    const weaker: string[] = []
    for (let short = 20; short <= 130; short += 5) {
      let previous = 0
      for (let long = short * 1.36; long <= 180; long += 0.5) {
        const count = resized(base, long, short).magnets.count
        if (count < previous) weaker.push(`${long}×${short}: ${previous} → ${count}`)
        previous = count
      }
    }
    expect(weaker).toEqual([])
  })

  it('offers every count a preset can pick', () => {
    const all = [...ROUND_SIZES, ...POLYGON_SIZES, ...OVAL_SIZES, ...PILL_SIZES, ...RECT_SIZES].map((size) => presetFor(size))
    for (const config of all) {
      expect(MAGNET_CHOICES).toContain(config.magnets.count)
      expect(RIB_CHOICES).toContain(config.ribs.count)
    }
  })

  it('keeps every automatic magnet boss inside the real well outline', () => {
    const configs = [...ROUND_SIZES, ...OVAL_SIZES, ...PILL_SIZES, ...RECT_SIZES, ...POLYGON_SIZES].map((size) => presetFor(size))
    const elongatedShapes: BaseConfig['shape'][] = ['oval', 'pill', 'rect']
    for (const shape of elongatedShapes) {
      const source = shape === 'oval' ? OVAL_SIZES[0] : shape === 'pill' ? PILL_SIZES[0] : RECT_SIZES[0]
      for (const short of [20, 35, 45, 46, 60, 70, 90]) {
        for (const long of [62, 95, 101, 102, 132, 180]) {
          if (long >= short) configs.push(resized(presetFor(source), long, short))
        }
      }
    }
    for (const sides of [3, 4, 5, 6, 8, 12]) {
      for (const width of [25, 40, 50, 60, 100, 160]) configs.push({ ...presetFor(POLYGON_SIZES[0]), sides, width, length: width })
    }

    for (const config of configs) {
      const outline = baseOutline(wasm, config)
      const well = outline.offset(-config.wallThickness, 'Miter', 2, config.segments)
      const wellBounds = well.bounds()
      const halfWidth = (wellBounds.max[0] - wellBounds.min[0]) / 2
      const halfLength = (wellBounds.max[1] - wellBounds.min[1]) / 2
      const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
      const bossRadius = pocketRadius + config.magnets.bossWall
      const magnets = magnetPositions(config.magnets.count, halfWidth, halfLength, bossRadius + LABEL_MARGIN, {
        ellipticalRow: config.shape === 'oval',
      })
      const contours = well.toPolygons()

      for (const magnet of magnets) {
        const inside = Array.from({ length: 72 }, (_, index) => {
          const angle = (index * 2 * Math.PI) / 72
          return pointInContours(contours, magnet.x + bossRadius * Math.cos(angle), magnet.y + bossRadius * Math.sin(angle))
        })
        expect(inside.every(Boolean), `${config.shape} ${config.width}×${config.length}, ${config.sides} sides`).toBe(true)
      }
      outline.delete()
      well.delete()
    }
  })
})
