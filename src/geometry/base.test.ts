import { readFileSync } from 'node:fs'
import type { Mesh } from 'manifold-3d'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildBase, magnetPositions, ribAngles } from './base'
import { toStl } from './exporters'
import { loadManifold } from './manifold'
import { defaultLabel, trimNumber } from './outline'
import {
  MAGNET_CHOICES,
  OVAL_SIZES,
  PILL_SIZES,
  POLYGON_SIZES,
  presetFor,
  RECT_SIZES,
  RIB_CHOICES,
  ROUND_SIZES,
  type SizePreset,
} from './presets'
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
    const { stats } = build(preset(ROUND_32))
    expect(stats.volume).toBeLessThan(Math.PI * 16 ** 2 * 4)
    expect(stats.volume).toBeGreaterThan(0)
  })

  it('drills a pocket at every magnet position, open at the top face so the magnet sits flush', () => {
    // Ribs are aimed at the bosses, so they are switched off to isolate the bore.
    const base = preset(ROUND_SIZES[4])
    const config = { ...base, ribs: { ...base.ribs, count: 0 } }
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const ringRadius = (config.width / 2 - config.wallThickness) / 2
    const { mesh } = build(config)

    for (let i = 0; i < config.magnets.count; i++) {
      const a = Math.PI / 2 + (2 * Math.PI * i) / config.magnets.count
      const pocket = pocketAt(mesh, ringRadius * Math.cos(a), ringRadius * Math.sin(a), pocketRadius)
      expect(pocket.vertices, `pocket ${i}`).toBeGreaterThan(0)
      // Cut down from the top face by exactly the magnet's thickness, so the magnet
      // finishes flush and the material under it is solid.
      expect(pocket.minZ, `pocket ${i} floor`).toBeCloseTo(config.height - config.magnets.thickness, 5)
      expect(pocket.maxZ, `pocket ${i} opening`).toBeCloseTo(config.height, 5)
      expect(pocket.maxRadius, `pocket ${i} bore`).toBeCloseTo(pocketRadius, 2)
    }
  })

  it.each([1, 1.5, 2, 3])('keeps a %dmm magnet flush with the top of its boss', (thickness) => {
    const base = preset(ROUND_SIZES[4])
    const config = { ...base, ribs: { ...base.ribs, count: 0 }, magnets: { ...base.magnets, thickness } }
    const ringRadius = (config.width / 2 - config.wallThickness) / 2
    const bore = (config.magnets.diameter + config.magnets.clearance) / 2

    const pocket = pocketAt(build(config).mesh, 0, ringRadius, bore)
    expect(pocket.maxZ).toBeCloseTo(config.height, 5)
    expect(pocket.maxZ - pocket.minZ).toBeCloseTo(thickness, 5)
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

  it('opens the pocket at the build plate on a solid base', () => {
    const base = preset(ROUND_32)
    const config = { ...base, underside: 'solid' as const, magnets: { ...base.magnets, count: 1, thickness: 2 } }
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const pocket = pocketAt(build(config).mesh, 0, 0, pocketRadius)
    expect(pocket.minZ).toBeCloseTo(0, 5)
    expect(pocket.maxZ).toBeCloseTo(2, 2)
  })

  it('keeps a solid base solid on top', () => {
    const config = { ...preset(ROUND_32), underside: 'solid' as const }
    const withWell = build(preset(ROUND_32)).stats.volume
    expect(build(config).stats.volume).toBeGreaterThan(withWell)
  })

  it.for([RECT_SIZES[0], RECT_SIZES[1], ROUND_SIZES[0], ROUND_SIZES[1]])('still fits a marking on a cramped $label base', (size) => {
    // The well of a small base is mostly boss and ribs, and the marking used to be
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
    const reach = 60 / 2 - config.wallThickness - pocketRadius - config.magnets.bossWall - 0.8
    expect(pocketAt(mesh, reach, 0, pocketRadius).vertices).toBeGreaterThan(0)
  })

  it.for([ROUND_SIZES[1], ROUND_SIZES[4], OVAL_SIZES[0]])('welds cleanly on a $label base', (size) => {
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
    expect(() => build({ ...preset(ROUND_32), floorThickness: 4 })).toThrow(/No room left for a well/)
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
    // Coprime counts cannot all line up, but the phase is taken from a boss
    // bearing, so at least one is always exact rather than merely close.
    const through = bosses.filter((boss) => spokes.some((angle) => clearance(angle, boss) < 1e-9))
    expect(through.length).toBeGreaterThan(0)
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

  it('offers every count a preset can pick', () => {
    const all = [...ROUND_SIZES, ...POLYGON_SIZES, ...OVAL_SIZES, ...PILL_SIZES, ...RECT_SIZES].map(presetFor)
    for (const config of all) {
      expect(MAGNET_CHOICES).toContain(config.magnets.count)
      expect(RIB_CHOICES).toContain(config.ribs.count)
    }
  })
})
