import type { Mesh } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import { buildPaintRack, defaultPaintRackConfig, paintRackCells, paintRackLayout, paintRackName, paintRackPieceName } from './paintRack'
import type { PaintRackConfig } from './types'

let wasm: Awaited<ReturnType<typeof loadManifold>>

function LOADOUT_PIECES(): [string, PaintRackConfig][] {
  const config = rack({ rows: 3, items: [module(2), corner(), module(5), corner(), module(3)], leftEnd: true, rightEnd: true })
  return paintRackLayout(config).pieces.map((piece, index) => [`the ${paintRackPieceName(piece)} piece`, { ...config, piece: index }])
}

beforeAll(async () => {
  wasm = await loadManifold()
})

const rack = (overrides: Partial<PaintRackConfig> = {}): PaintRackConfig => ({ ...defaultPaintRackConfig(), ...overrides })
let ids = 0
const module = (columns: number) => ({ id: `piece-${ids++}`, kind: 'module' as const, columns })
const corner = () => ({ id: `piece-${ids++}`, kind: 'corner' as const, columns: 0 })
const LOADOUT = rack({ items: [module(5), module(4), module(4)], leftEnd: true, rightEnd: true })
/** A corner after a single column, which stays the longest run, so the corner sits in the back wall's frame. */
const CORNERED = rack({ items: [module(1), corner()] })
const cornerOf = (config: PaintRackConfig) => paintRackLayout(config).pieces.find((piece) => piece.kind === 'corner')!

/** The default rack's cells where the assembled preview places them. */
function cells(config: PaintRackConfig) {
  const { center } = paintRackLayout(config)
  return paintRackCells(config, 5, 4).map((cell) => ({ ...cell, x: cell.x - center.x, y: cell.y - center.y }))
}

const CONFIGS: [string, PaintRackConfig][] = [
  ['the default rack', rack()],
  ['a single cell', rack({ rows: 1, items: [module(1)] })],
  ...LOADOUT_PIECES(),
  ['a front row high enough to need no floor', rack({ frontHeight: 40 })],
  ['thick walls', rack({ wall: 1.6, pocketDiameter: 32, frontHeight: 18 })],
  ['flat decks', rack({ pocketDepth: 0 })],
  ['shallow pockets', rack({ pocketDepth: 3 })],
  ['deep pockets', rack({ pocketDepth: 12 })],
  ['flat rows', rack({ rise: 0 })],
]

function vertices(mesh: Mesh) {
  return Array.from({ length: mesh.vertProperties.length / mesh.numProp }, (_value, index) =>
    [0, 1, 2].map((axis) => mesh.vertProperties[index * mesh.numProp + axis]),
  )
}

function maxZ(mesh: Mesh) {
  return Math.max(...vertices(mesh).map(([, , z]) => z))
}

function duplicatePositions(mesh: Mesh) {
  const keys = vertices(mesh).map((vertex) => vertex.join(','))
  return keys.length - new Set(keys).size
}

/**
 * Downward faces steeper than 45° from vertical, other than the face on the build plate and the flat
 * undersides of the decks and brush caps, which bridge between the walls and the tubes they carry.
 */
function unsupportedFaces(mesh: Mesh, config: PaintRackConfig) {
  // Seat decks sit below their pockets; a corner's brush caps sit at the rim.
  const decks = Array.from({ length: 6 }, (_row, row) => config.frontHeight + row * config.rise).flatMap((deck) => [
    deck,
    deck + config.pocketDepth,
  ])
  const bridge = (z: number) => decks.some((deck) => z < deck && z > deck - 2)
  const points = vertices(mesh)
  let count = 0
  for (let index = 0; index < mesh.triVerts.length; index += 3) {
    const [a, b, c] = [0, 1, 2].map((vertex) => points[mesh.triVerts[index + vertex]])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const length = Math.hypot(...normal)
    if (length === 0) continue
    const onPlate = Math.max(a[2], b[2], c[2]) < 1e-6
    const flat = normal[2] / length < -1 + 1e-6 && Math.max(a[2], b[2], c[2]) - Math.min(a[2], b[2], c[2]) < 1e-6
    if (!onPlate && !(flat && bridge(a[2])) && normal[2] / length < -Math.SQRT1_2 - 1e-3) count++
  }
  return count
}

function solidAt(mesh: Mesh, x: number, y: number, z: number): boolean {
  const solid = new wasm.Manifold(mesh)
  const slice = solid.slice(z)
  const probe = wasm.CrossSection.square([0.1, 0.1], true)
  const placed = probe.translate([x, y])
  const hit = slice.intersect(placed)
  const area = hit.area()
  for (const value of [solid, slice, probe, placed, hit]) value.delete()
  return area > 0
}

/** Separate solids, ignoring the sealed air under each deck, which decomposes as a body of negative volume. */
function bodies(mesh: Mesh) {
  const solid = new wasm.Manifold(mesh)
  const parts = solid.decompose()
  const count = parts.filter((part) => part.volume() > 0).length
  for (const part of parts) part.delete()
  solid.delete()
  return count
}

describe('paint rack layout', () => {
  it('holds one bottle per cell across every module', () => {
    expect(paintRackLayout(LOADOUT).bottles).toBe(58)
  })

  it('steps each end back a cell for every two rows behind the front', () => {
    const rows = (index: number) => paintRackLayout(LOADOUT).pieces[index].cells.map((cell) => cell.row)
    expect([rows(0), rows(4)]).toEqual([
      [1, 2, 3, 3],
      [2, 3],
    ])
  })

  it.each([
    ['right', (items: PaintRackConfig['items']) => [...items, corner(), module(3)]],
    ['left', (items: PaintRackConfig['items']) => [module(3), corner(), ...items]],
  ])('leaves every piece as it was when the rack grows on the %s', (_side, grow) => {
    const before = rack({ items: [module(5), module(4)], leftEnd: true })
    const shape = (config: PaintRackConfig, id: string) => {
      const piece = paintRackLayout(config).pieces.find((entry) => entry.item !== undefined && config.items[entry.item].id === id)!
      const [origin] = piece.cells
      return piece.cells.map((cell) => [cell.x - origin.x, cell.y - origin.y, cell.angle, cell.height, cell.kind])
    }
    const after = { ...before, items: grow(before.items) }
    expect(before.items.map((item) => shape(after, item.id))).toEqual(before.items.map((item) => shape(before, item.id)))
  })

  it('turns the run after a corner a quarter', () => {
    const { pieces } = paintRackLayout(rack({ items: [module(5), corner(), module(5)] }))
    expect(pieces.map((piece) => piece.frame.turns)).toEqual([0, 0, 1])
  })

  it('lays the longest run across the back, however the rack grew', () => {
    const { pieces } = paintRackLayout(rack({ items: [module(2), corner(), module(5)] }))
    expect(pieces.map((piece) => piece.frame.turns)).toEqual([-1, -1, 0])
  })

  it('seats bottles in a corner wherever its mitre leaves room, and caps the rest for brushes', () => {
    const kinds = new Set(cornerOf(CORNERED).cells.map((cell) => cell.kind))
    expect([...kinds].sort()).toEqual(['brushes', 'seat', 'solid'])
  })

  it('packs a corner with brush holes', () => {
    expect(paintRackLayout(CORNERED).brushes).toBeGreaterThan(5)
  })

  it('opens every brush hole from its cap down to the table', () => {
    const config = CORNERED
    const { center } = paintRackLayout(config)
    const { mesh } = buildPaintRack(wasm, config)
    const holes = cornerOf(config).cells.flatMap((cell) =>
      (cell.brushes ?? []).map(([x, y]) => ({ x: x - center.x, y: y - center.y, top: cell.height })),
    )
    expect(holes.every((hole) => [0.2, hole.top / 2, hole.top - 0.3].every((z) => !solidAt(mesh, hole.x, hole.y, z)))).toBe(true)
  })

  it('stands every brush tube on the table', () => {
    const config = CORNERED
    const { center } = paintRackLayout(config)
    const { mesh } = buildPaintRack(wasm, config)
    const wall = config.brushDiameter / 2 + config.wall / 2
    const tubes = cornerOf(config).cells.flatMap((cell) => (cell.brushes ?? []).map(([x, y]) => [x - center.x + wall, y - center.y]))
    expect(tubes.every(([x, y]) => solidAt(mesh, x, y, 0.2))).toBe(true)
  })

  it('places the ends outside the modules, in order', () => {
    expect(paintRackLayout(LOADOUT).pieces.map(paintRackPieceName)).toEqual([
      'paint-rack-left-end-4-rows',
      'paint-rack-5x4',
      'paint-rack-4x4',
      'paint-rack-4x4',
      'paint-rack-right-end-4-rows',
    ])
  })

  it('staggers alternate rows by half a cell so they tile as a honeycomb', () => {
    const [front, second] = [0, 5].map((index) => paintRackCells(rack(), 5, 4)[index])
    expect(second.x - front.x).toBeCloseTo(rack().pitch / 2)
  })

  it('raises each row behind the front one by the rise', () => {
    const heights = paintRackCells(rack(), 5, 4)
      .filter((_cell, index) => index % 5 === 0)
      .map((cell) => cell.height)
    expect(heights).toEqual([22, 48, 74, 100])
  })

  it('names a single module after its columns and rows', () => {
    expect(paintRackName(rack({ items: [module(3)] }))).toBe('paint-rack-3x4')
  })

  it('names a loadout after the bottles it holds', () => {
    expect(paintRackName(LOADOUT)).toBe('paint-rack-58-bottles')
  })
})

describe('paint rack geometry', () => {
  it.each(CONFIGS)('prints %s without supports', (_name, config) => {
    expect(unsupportedFaces(buildPaintRack(wasm, config).mesh, config)).toBe(0)
  })

  it.each(CONFIGS)('keeps %s as one body', (_name, config) => {
    expect(bodies(buildPaintRack(wasm, config).mesh)).toBe(1)
  })

  it.each(CONFIGS)('never shares a vertex position in %s, which a slicer would weld into a non-manifold edge', (_name, config) => {
    expect(duplicatePositions(buildPaintRack(wasm, config).mesh)).toBe(0)
  })

  it('stands as tall as the back row plus its lip', () => {
    expect(maxZ(buildPaintRack(wasm, rack()).mesh)).toBeCloseTo(100)
  })

  it('stands an end as tall as the module beside it', () => {
    expect(maxZ(buildPaintRack(wasm, { ...LOADOUT, piece: 0 }).mesh)).toBeCloseTo(100)
  })

  it('leaves clearance between neighbouring pieces, so the assembly is exactly the pieces side by side', () => {
    const pieces = paintRackLayout(LOADOUT).pieces.reduce(
      (total, _piece, index) => total + buildPaintRack(wasm, { ...LOADOUT, piece: index }).stats.volume,
      0,
    )
    expect(buildPaintRack(wasm, LOADOUT).stats.volume).toBeCloseTo(pieces, 0)
  })

  it('keeps the runs either side of a corner clear of it and of each other', () => {
    const config = rack({ items: [module(3), corner(), module(3), corner(), module(3)], leftEnd: true, rightEnd: true })
    const pieces = paintRackLayout(config).pieces.reduce(
      (total, _piece, index) => total + buildPaintRack(wasm, { ...config, piece: index }).stats.volume,
      0,
    )
    expect(buildPaintRack(wasm, config).stats.volume).toBeCloseTo(pieces, 0)
  })

  it('assembles every piece as its own body', () => {
    expect(bodies(buildPaintRack(wasm, LOADOUT).mesh)).toBe(5)
  })

  it('centres an exported piece on the plate', () => {
    const { mesh } = buildPaintRack(wasm, { ...LOADOUT, piece: 2 })
    const xs = vertices(mesh).map(([x]) => x)
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0)
  })

  it('caps each cell with a deck around its bore', () => {
    const config = rack()
    const { mesh } = buildPaintRack(wasm, config)
    const decks = cells(config).map((cell) => {
      const deck = cell.height - config.pocketDepth
      const x = cell.x + config.seatDiameter / 2 + config.wall + 1.5
      return [solidAt(mesh, x, cell.y, deck - 0.4), solidAt(mesh, x, cell.y, deck - 3)]
    })
    expect(decks.every(([deck, below]) => deck && !below)).toBe(true)
  })

  it('rounds each pot pocket with a rim over hollow corners', () => {
    const config = rack()
    const { mesh } = buildPaintRack(wasm, config)
    // Pointy-topped hexes put a corner at 30°, where the round pocket leaves the most room.
    const [dx, dy] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)].map((axis) => axis * (config.pocketDiameter / 2 + 1))
    const rims = cells(config).map((cell) => [
      solidAt(mesh, cell.x + dx, cell.y + dy, cell.height - 0.4),
      solidAt(mesh, cell.x + dx, cell.y + dy, cell.height - 7),
    ])
    expect(rims.every(([rim, hollow]) => rim && !hollow)).toBe(true)
  })

  it('leaves the push-out hole open through every ledge', () => {
    const config = rack()
    const { mesh } = buildPaintRack(wasm, config)
    const rimOfHole = (cell: { height: number }) =>
      cell.height - config.pocketDepth - config.seatDepth + (config.seatDiameter - config.holeDiameter) / 2
    const open = cells(config).every((cell) => !solidAt(mesh, cell.x + config.holeDiameter / 2 - 0.3, cell.y, rimOfHole(cell) - 0.3))
    expect(open).toBe(true)
  })

  it('carries a ledge just outside each hole', () => {
    const config = rack()
    const { mesh } = buildPaintRack(wasm, config)
    const ledge = (cell: { height: number }, radius: number) =>
      cell.height - config.pocketDepth - config.seatDepth - (radius - config.seatDiameter / 2)
    const radius = config.holeDiameter / 2 + 0.3
    expect(cells(config).every((cell) => solidAt(mesh, cell.x + radius, cell.y, ledge(cell, radius) - 0.2))).toBe(true)
  })

  it('lands a front funnel that would reach the plate on a floor', () => {
    const config = rack()
    const front = cells(config)[0]
    expect(solidAt(buildPaintRack(wasm, config).mesh, front.x + config.pitch / 2 - 2, front.y, 0.2)).toBe(true)
  })

  it('weighs well under the 211g solid stepped rack it replaces', () => {
    expect(buildPaintRack(wasm, rack()).stats.grams).toBeLessThan(170)
  })

  it.each([
    ['walls under two nozzle widths', { wall: 0.6 }, 'Rack walls are too thin to print'],
    ['a seat wider than its cell', { seatDiameter: 34, pocketDepth: 0 }, 'Bottle seat must fit inside its cell'],
    ['a pocket that leaves only a sliver of rim', { pocketDiameter: 35 }, 'Pot pocket must sit between the seat and the walls'],
    ['a hole wider than its seat', { holeDiameter: 27 }, 'Push-out hole must be narrower than the seat'],
    ['a pocket narrower than its seat', { pocketDiameter: 27 }, 'Pot pocket must sit between the seat and the walls'],
    ['a seat shallower than its deck', { seatDepth: 1 }, 'Bottle seat is too shallow for the deck'],
    ['a front deck lower than its seat', { frontHeight: 8 }, 'Front row is too low for its bottle seat'],
    ['brush holes too narrow for a brush', { brushDiameter: 3 }, 'Brush holes are too narrow for a brush'],
    ['no pieces', { items: [] }, 'Add a piece to start the rack'],
  ])('rejects %s', (_name, overrides, message) => {
    expect(() => buildPaintRack(wasm, rack(overrides))).toThrow(message)
  })
})
