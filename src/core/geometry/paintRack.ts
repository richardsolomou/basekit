import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import type { BuildResult } from './base'
import { curveTolerance, segmentsForTolerance } from './quality'
import type { PaintRackConfig } from './types'

const PLA_DENSITY = 1.24e-3
const MIN_WALL = 0.8
/** Clearance between the facing walls of neighbouring pieces, so separately printed pieces still slot together. */
const PIECE_CLEARANCE = 0.2
const SQRT3 = Math.sqrt(3)
/** Flat top over each cell, bridged between the walls and the bore so the rack reads as a solid shelf. */
const DECK = 0.8
/** Round band at the top of each pot pocket, above the chamfer that carries it. */
const RIM = 0.8

export type PaintRackPieceKind = 'module' | 'corner' | 'left-end' | 'right-end'

/**
 * A run's frame in the loadout: a run rotates a quarter turn clockwise for every corner before it. Within a run
 * the rows climb along +y and the columns go left to right along +x.
 */
export interface PaintRackFrame {
  x: number
  y: number
  turns: number
}

/** Where a corner cell is cut by the corner's mitre: it keeps the side where `nx·x + ny·y` is at most `offset`. */
export interface PaintRackMitre {
  nx: number
  ny: number
  offset: number
}

export interface PaintRackCell {
  x: number
  y: number
  /** Degrees about the cell's centre; the second half of a corner continues a lattice turned a quarter. */
  angle: number
  row: number
  /** Height of the cell's rim, around the top of its pot pocket. */
  height: number
  /** A seat holds a bottle; where a mitre leaves too little room for one, the cell is capped and holds brushes. */
  kind: 'seat' | 'brushes' | 'solid'
  mitre?: PaintRackMitre
  /** Centres of the brush holes through a brush cell's cap. */
  brushes?: [number, number][]
}

export interface PaintRackPiece {
  kind: PaintRackPieceKind
  /** The loadout item a module or corner was built from; ends follow from their toggles instead. */
  item?: number
  columns: number
  rows: number
  frame: PaintRackFrame
  /** In the piece's run frame. */
  cells: PaintRackCell[]
}

export interface PaintRackLayout {
  pieces: PaintRackPiece[]
  bottles: number
  brushes: number
  width: number
  length: number
  height: number
  /** Offset that centres the loadout on the origin. */
  center: { x: number; y: number }
}

const count = (value: number) => Math.max(1, Math.round(value))
const rowPitch = (config: PaintRackConfig) => (config.pitch * SQRT3) / 2
/** A row's rim: its deck plus the pot pocket above it. */
const rowHeight = (config: PaintRackConfig, row: number) => config.frontHeight + row * config.rise + config.pocketDepth
/** A hex's outer corner distance, which bounds a row front and back. */
const cornerRadius = (config: PaintRackConfig) => (config.pitch + config.wall) / SQRT3
/** Separate pieces stand this far apart along a run; the slanted walls face 60° off it, so a shift opens them by half. */
const pieceGap = (config: PaintRackConfig) => (config.wall + PIECE_CLEARANCE) * 2
/** Cells left narrower than this by a mitre are filled solid rather than left as slots too thin to print well. */
const MIN_CUP = 8
const MIN_BRUSH_HOLE = 4
/** Rim kept between a pot pocket and its cell's walls; any thinner and the rim at the flats is a sliver too thin to print. */
export const POCKET_CLEARANCE = 0.3
/** Kept between a brush tube and anything else, so their faces never meet. */
const BRUSH_GAP = 0.8

/** A lattice cell's centre: row 0 at the front, and odd rows half a cell to the right so the cells tile as a honeycomb. */
const latticeX = (config: PaintRackConfig, column: number, row: number) => column * config.pitch + (row % 2 === 0 ? 0 : config.pitch / 2)

/** A module's cells in its own frame. Every piece shares that lattice, which is what lets their zigzag edges interlock. */
export function paintRackCells(config: PaintRackConfig, columns: number, rows: number, x = 0): PaintRackCell[] {
  return Array.from({ length: count(rows) }, (_row, row) =>
    Array.from({ length: count(columns) }, (_column, column) => latticeCell(config, x + latticeX(config, column, row), row)),
  ).flat()
}

const latticeCell = (config: PaintRackConfig, x: number, row: number): PaintRackCell => ({
  x,
  y: row * rowPitch(config),
  angle: 0,
  row,
  height: rowHeight(config, row),
  kind: 'seat',
})

/** Rotates a point a quarter turn clockwise per turn. */
function turn([x, y]: [number, number], turns: number): [number, number] {
  const quarter = ((turns % 4) + 4) % 4
  return quarter === 0 ? [x, y] : quarter === 1 ? [y, -x] : quarter === 2 ? [-x, -y] : [-y, x]
}

function toWorld(frame: PaintRackFrame, point: [number, number]): [number, number] {
  const [x, y] = turn(point, frame.turns)
  return [x + frame.x, y + frame.y]
}

/** A hex's corners, pointy-topped before the cell's own rotation. */
function hexCorners(cell: PaintRackCell, flats: number): [number, number][] {
  return Array.from({ length: 6 }, (_corner, index) => {
    const angle = ((90 + 60 * index + cell.angle) * Math.PI) / 180
    return [cell.x + (Math.cos(angle) * flats) / SQRT3, cell.y + (Math.sin(angle) * flats) / SQRT3] as [number, number]
  })
}

/** Keeps the part of a convex polygon on the mitre's side, offset outwards by `slack`. */
function clipPolygon(points: [number, number][], mitre: PaintRackMitre | undefined, slack = 0): [number, number][] {
  if (!mitre) return points
  const side = ([x, y]: [number, number]) => mitre.nx * x + mitre.ny * y - mitre.offset - slack
  const kept: [number, number][] = []
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length]
    const [a, b] = [side(point), side(next)]
    if (a <= 0) kept.push(point)
    if (a * b < 0) {
      const t = a / (a - b)
      kept.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t])
    }
  })
  return kept
}

/**
 * As many brush holes as fit in a convex outline, each kept `clearance` from its edges. A hex packing is tried at a
 * spread of offsets, since where the lattice falls decides how many land inside a cut cell.
 */
function packBrushes(outline: [number, number][], hole: number, wall: number): [number, number][] {
  const clearance = hole / 2 + wall + BRUSH_GAP
  const inside = ([x, y]: [number, number]) =>
    outline.every(([ax, ay], index) => {
      const [bx, by] = outline[(index + 1) % outline.length]
      return ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / Math.hypot(bx - ax, by - ay) >= clearance
    })
  const spacing = hole + wall * 2 + BRUSH_GAP
  const xs = outline.map(([x]) => x)
  const ys = outline.map(([, y]) => y)
  const tries = 6
  let best: [number, number][] = []
  for (let i = 0; i < tries; i++) {
    for (let j = 0; j < tries; j++) {
      const found: [number, number][] = []
      for (let row = 0, y = Math.min(...ys) + (j * spacing) / tries; y <= Math.max(...ys); row++, y += (spacing * SQRT3) / 2) {
        for (let x = Math.min(...xs) + (i / tries + (row % 2) / 2) * spacing; x <= Math.max(...xs); x += spacing) {
          if (inside([x, y])) found.push([x, y])
        }
      }
      if (found.length > best.length) best = found
    }
  }
  return best
}

/**
 * A corner turns the run a quarter clockwise round an inside corner, with the back rows against both walls. Its
 * square spans the run's depth each way and is split by a 45° mitre from the inner corner to the wall corner: the
 * first half continues this run's lattice, the second half the next run's, turned a quarter. A cell cut by the
 * mitre keeps its seat when its pocket clears it, is capped at its rim and holds brushes when it is still wide enough,
 * and is filled solid when it is only a sliver.
 */
function cornerPiece(config: PaintRackConfig, rows: number, x: number): { cells: PaintRackCell[]; next: { x: number; y: number } } {
  const reach = cornerRadius(config)
  const half = config.wall / 2
  const left = x - config.pitch / 2 - half
  const front = -reach
  const depth = (rows - 1) * rowPitch(config) + reach * 2
  const nextX = left + reach
  const nextY = front - config.pitch / 2 + half - pieceGap(config)
  const inner = (config.pitch - config.wall) / 2
  const columns = Math.ceil(depth / config.pitch) + 2
  // The mitre's normal points into the second half; each half keeps its own side of it.
  const normal = Math.SQRT1_2
  const offset = normal * (left - front)
  const cells: PaintRackCell[] = []
  const classify = (cell: PaintRackCell, mitre: PaintRackMitre) => {
    const along = ([px, py]: [number, number]) => mitre.nx * px + mitre.ny * py - mitre.offset
    const reaches = hexCorners(cell, config.pitch - config.wall).map(along)
    // How far the cell's hollow runs back from the mitre wall's face, measured along the mitre's normal.
    const kept = Math.min(Math.max(...reaches), -half) - Math.min(...reaches)
    if (kept <= 0) return
    if (along([cell.x, cell.y]) <= -(inner + half)) return cells.push({ ...cell, mitre })
    if (kept < MIN_CUP) return cells.push({ ...cell, mitre, kind: 'solid' })
    const hollow = clipPolygon(hexCorners(cell, config.pitch - config.wall), mitre, -half)
    cells.push({ ...cell, mitre, kind: 'brushes', brushes: packBrushes(hollow, config.brushDiameter, config.wall) })
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column <= columns; column++) {
      classify(latticeCell(config, x + latticeX(config, column, row), row), { nx: normal, ny: -normal, offset })
      // The next run's lattice, columns counting back towards the corner, carried into this run's frame.
      const [across, up] = [latticeX(config, -1 - column, row) - pieceGap(config), row * rowPitch(config)]
      classify(
        { ...latticeCell(config, 0, row), x: nextX + up, y: nextY - across, angle: -90 },
        { nx: -normal, ny: normal, offset: -offset },
      )
    }
  }
  return { cells, next: { x: nextX, y: nextY } }
}

/**
 * Corners before the run with the most columns, which the preview lays across the back. Each corner turns the next
 * run clockwise, so turning the whole rack back by that many keeps the longest run square however the rack grew.
 */
function backWallTurns(config: PaintRackConfig): number {
  const runs = [0]
  for (const item of config.items) {
    if (item.kind === 'corner') runs.push(0)
    else runs[runs.length - 1] += count(item.columns)
  }
  return runs.indexOf(Math.max(...runs))
}

/**
 * Modules and corners in order with an optional end at each side, spaced so the walls of neighbouring pieces never
 * collide. An end adds a cell to every row for each two behind the front, so the run's side steps back at the
 * lattice's own 60° instead of leaving a zigzag.
 */
export function paintRackLayout(config: PaintRackConfig): PaintRackLayout {
  const gap = pieceGap(config)
  const pieces: PaintRackPiece[] = []
  const rows = count(config.rows)
  let frame: PaintRackFrame = { x: 0, y: 0, turns: 0 - backWallTurns(config) }
  let x = 0
  for (const [index, item] of config.items.entries()) {
    if (item.kind === 'module') {
      const columns = count(item.columns)
      pieces.push({ kind: 'module', item: index, columns, rows, frame, cells: paintRackCells(config, columns, rows, x) })
      x += columns * config.pitch + gap
    } else {
      const corner = cornerPiece(config, rows, x)
      pieces.push({ kind: 'corner', item: index, columns: 0, rows, frame, cells: corner.cells })
      const [nx, ny] = toWorld(frame, [corner.next.x, corner.next.y])
      frame = { x: nx, y: ny, turns: frame.turns + 1 }
      x = 0
    }
  }
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  const wing = (columns: (row: number) => number[], shift: number) =>
    Array.from({ length: rows }, (_row, row) =>
      columns(row).map((column) => latticeCell(config, latticeX(config, column, row) + shift, row)),
    ).flat()
  if (config.leftEnd && first) {
    const cells = wing((row) => Array.from({ length: Math.ceil(row / 2) }, (_column, index) => -1 - index), -gap)
    if (cells.length) pieces.unshift({ kind: 'left-end', columns: 0, rows, frame: first.frame, cells })
  }
  if (config.rightEnd && last) {
    const cells = wing((row) => Array.from({ length: Math.floor(row / 2) }, (_column, index) => index), x)
    if (cells.length) pieces.push({ kind: 'right-end', columns: 0, rows, frame, cells })
  }

  const points = pieces.flatMap((piece) =>
    piece.cells.flatMap((cell) =>
      clipPolygon(hexCorners(cell, config.pitch + config.wall), cell.mitre, config.wall).map((point) => toWorld(piece.frame, point)),
    ),
  )
  const xs = points.map(([px]) => px)
  const ys = points.map(([, py]) => py)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return {
    pieces,
    bottles: pieces.reduce((total, piece) => total + piece.cells.filter((cell) => cell.kind === 'seat').length, 0),
    brushes: pieces.reduce((total, piece) => total + piece.cells.reduce((sum, cell) => sum + (cell.brushes?.length ?? 0), 0), 0),
    width: maxX - minX,
    length: maxY - minY,
    height: rowHeight(config, rows - 1),
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  }
}

export function paintRackPieceName(piece: PaintRackPiece): string {
  return piece.kind === 'module' ? `paint-rack-${piece.columns}x${piece.rows}` : `paint-rack-${piece.kind}-${piece.rows}-rows`
}

/** The loadout left to right, such as `end · 5×4 · corner · 3×4 · end`. */
export function paintRackLoadout(config: PaintRackConfig): string {
  return paintRackLayout(config)
    .pieces.map((piece) => (piece.kind === 'module' ? `${piece.columns}×${piece.rows}` : piece.kind === 'corner' ? 'corner' : 'end'))
    .join(' · ')
}

export function paintRackName(config: PaintRackConfig): string {
  const layout = paintRackLayout(config)
  return layout.pieces.length === 1 ? paintRackPieceName(layout.pieces[0]) : `paint-rack-${layout.bottles}-bottles`
}

export function defaultPaintRackConfig(): PaintRackConfig {
  return {
    kind: 'paint-rack',
    items: [{ id: 'paint-rack-1', kind: 'module', columns: 5 }],
    rows: 4,
    leftEnd: false,
    rightEnd: false,
    pitch: 35,
    rise: 26,
    frontHeight: 17,
    seatDiameter: 26,
    seatDepth: 16,
    holeDiameter: 19.5,
    pocketDiameter: 33.3,
    pocketDepth: 5,
    wall: 0.85,
    brushDiameter: 10,
    segments: 128,
  }
}

/**
 * Every cell is a hex tube sharing its walls with its neighbours, standing on the plate and capped by a
 * thin deck with a round bore, so it looks like a solid shelf while printing as walls. Pots stand on
 * the deck; droppers drop into the bore onto a 45° funnel, and nothing needs supports.
 * The preview shows the whole loadout; `piece` builds one piece of it for export.
 */
export function buildPaintRack(wasm: ManifoldToplevel, config: PaintRackConfig): BuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)

  try {
    if (config.items.length === 0) throw new Error('Add a piece to start the rack')
    if (config.wall < MIN_WALL - 1e-9) throw new Error('Rack walls are too thin to print')
    const holeRadius = config.holeDiameter / 2
    const seatRadius = config.seatDiameter / 2
    const innerApothem = (config.pitch - config.wall) / 2
    const pocketRadius = config.pocketDiameter / 2
    if (seatRadius + config.wall >= innerApothem) throw new Error('Bottle seat must fit inside its cell')
    if (holeRadius <= config.wall || holeRadius >= seatRadius) throw new Error('Push-out hole must be narrower than the seat')
    if (config.seatDepth < DECK + config.wall) throw new Error('Bottle seat is too shallow for the deck')
    if (config.pocketDepth > 0 && (pocketRadius <= seatRadius + config.wall || pocketRadius > innerApothem - POCKET_CLEARANCE + 1e-9)) {
      throw new Error('Pot pocket must sit between the seat and the walls')
    }
    if (config.frontHeight < config.seatDepth + config.wall) throw new Error('Front row is too low for its bottle seat')
    if (config.brushDiameter < MIN_BRUSH_HOLE) throw new Error('Brush holes are too narrow for a brush')

    const layout = paintRackLayout(config)
    const tolerance = curveTolerance(layout.width, config.segments)
    const circleSegments = (radius: number) => Math.max(config.segments <= 256 ? 48 : 3, segmentsForTolerance(radius * 2, tolerance))

    const hexagon = (flats: number) => section(section(CrossSection.circle(flats / SQRT3, 6)).rotate(90))
    const outerHex = hexagon(config.pitch + config.wall)
    const innerHex = hexagon(config.pitch - config.wall)
    // Seats reach the middle of the walls rather than stopping at their faces, which would leave them tangent.
    const seatClip = hexagon(config.pitch)

    /**
     * The seat below a cell's deck, revolved from one profile measured down from the deck's top: the bore
     * tube, and a 45° funnel whose upper face is the ledge a dropper stands on and whose lower face spreads to
     * the walls. The tube tops out inside the deck, whose hole is half a wall wider, so no two faces coincide.
     */
    const seatTop = (radius: number) => -config.seatDepth - (radius - seatRadius)
    const far = cornerRadius(config) + 1
    const tube = seatRadius + config.wall
    const seatProfile = section(
      new CrossSection([
        [
          [holeRadius, seatTop(holeRadius) - config.wall],
          [far, seatTop(far) - config.wall],
          [far, seatTop(far)],
          [tube, seatTop(tube)],
          [tube, -DECK / 2],
          [seatRadius, -DECK / 2],
          [seatRadius, seatTop(seatRadius)],
          [holeRadius, seatTop(holeRadius)],
        ],
      ]),
    )
    const seat = solidOf(seatProfile.revolve(circleSegments(far)))
    const deckHole = solidOf(Manifold.cylinder(DECK + 2, seatRadius + config.wall / 2, seatRadius + config.wall / 2, circleSegments(tube)))
    /**
     * The pocket is the hex cell itself, rounded only by a rim at the top whose underside chamfers out to the
     * walls at 45°: it reads as a round cup while adding little more than wedges in the corners. The cone runs
     * a millimetre into the rim's bore so the two cross instead of meeting tangent.
     */
    const pocketSegments = circleSegments(pocketRadius)
    const chamfer = cornerRadius(config) - pocketRadius + 1
    const pocketVoid = (deck: number, height: number) => {
      const rim = height - RIM
      const shape = solidOf(
        Manifold.union([
          solidOf(solidOf(Manifold.cylinder(RIM + 2, pocketRadius, pocketRadius, pocketSegments)).translate([0, 0, rim - 1])),
          solidOf(
            solidOf(Manifold.cylinder(chamfer + 1, pocketRadius + chamfer, pocketRadius - 1, pocketSegments)).translate([
              0,
              0,
              rim - chamfer,
            ]),
          ),
          // Below the chamfer the pocket is the whole hex; a shallow pocket is all chamfer, cut off by the deck.
          solidOf(
            solidOf(
              Manifold.cylinder(Math.max(1, rim - chamfer + 1.5 - deck), pocketRadius + chamfer, pocketRadius + chamfer, pocketSegments),
            ).translate([0, 0, deck - 1]),
          ),
        ]),
      )
      return solidOf(Manifold.intersection([shape, solidOf(solidOf(innerHex.extrude(height + 1 - deck)).translate([0, 0, deck]))]))
    }
    // Where the funnel's underside meets the walls' corners, below the deck's top.
    const funnelDrop = config.seatDepth + (config.pitch - config.wall) / SQRT3 - seatRadius + config.wall
    // A funnel that would reach the plate before the walls' corners lands on a floor instead of floating.
    // The floor's hole is a wall narrower than the funnel's so their faces never coincide.
    const floorHoleRadius = holeRadius - config.wall
    const floorHole = solidOf(Manifold.cylinder(config.wall + 2, floorHoleRadius, floorHoleRadius, circleSegments(floorHoleRadius)))

    const tall = layout.height + 4
    /** Everything on the mitre's kept side, pushed past the mitre by `slack`: built facing +x, then turned onto its normal. */
    const halfPlane = (mitre: PaintRackMitre, slack: number) => {
      const span = layout.width + layout.length + config.pitch * 10
      const side = section(CrossSection.square([span, span * 2]).translate([mitre.offset + slack - span, -span]))
      const angle = (Math.atan2(mitre.ny, mitre.nx) * 180) / Math.PI
      return solidOf(solidOf(section(side.rotate(angle)).extrude(tall)).translate([0, 0, -2]))
    }
    const brushRadius = config.brushDiameter / 2
    const brushTube = section(
      section(CrossSection.circle(brushRadius + config.wall, circleSegments(brushRadius + config.wall))).subtract(
        section(CrossSection.circle(brushRadius - config.wall / 2, circleSegments(brushRadius))),
      ),
    )
    const brushHole = solidOf(Manifold.cylinder(layout.height + 4, brushRadius, brushRadius, circleSegments(brushRadius)))
    const clipTo = (value: Manifold, mitre: PaintRackMitre | undefined, slack: number) =>
      mitre ? solidOf(Manifold.intersection([value, halfPlane(mitre, slack)])) : value

    /** One piece in its run frame: hex cells sharing their walls, each capped by a deck over its seat. */
    const buildPiece = (piece: PaintRackPiece): Manifold => {
      const solids: Manifold[] = []
      const voids: Manifold[] = []
      const seats: Manifold[] = []
      const holes: Manifold[] = []
      for (const cell of piece.cells) {
        const place = (value: Manifold) => solidOf(solidOf(value.rotate([0, 0, cell.angle])).translate([cell.x, cell.y, 0]))
        // Each half of a corner reaches a wall past the mitre and is hollowed only to the mitre wall's face.
        solids.push(clipTo(place(solidOf(outerHex.extrude(cell.height))), cell.mitre, config.wall))
        if (cell.kind === 'solid') continue
        if (cell.kind === 'brushes') {
          // Hollow under a cap at the rim. Each brush stands in a tube from the table up into the cap; the tube starts
          // narrower than its hole, which is drilled last, so the hole is the only face at that radius.
          const hollow = solidOf(solidOf(innerHex.extrude(cell.height - DECK + 1)).translate([0, 0, -1]))
          voids.push(clipTo(place(hollow), cell.mitre, -config.wall / 2))
          for (const [x, y] of cell.brushes ?? []) {
            seats.push(solidOf(solidOf(brushTube.extrude(cell.height - DECK / 2)).translate([x, y, 0])))
            holes.push(solidOf(brushHole.translate([x, y, -1])))
          }
          continue
        }
        const deck = cell.height - config.pocketDepth
        const floored = deck - funnelDrop < config.wall * 2
        const base = floored ? config.wall / 2 : 0
        // The cell is hollow up to its deck, which stays part of the walls' own solid, as does the pocket's rim.
        const hollow = floored ? config.wall : -1
        const cellVoids = [
          solidOf(solidOf(innerHex.extrude(deck - DECK - hollow)).translate([0, 0, hollow])),
          solidOf(deckHole.translate([0, 0, deck - DECK - 1])),
        ]
        if (config.pocketDepth > 0) cellVoids.push(pocketVoid(deck, cell.height))
        if (floored) cellVoids.push(solidOf(floorHole.translate([0, 0, -1])))
        for (const value of cellVoids) voids.push(clipTo(place(value), cell.mitre, -config.wall / 2))
        const clip = solidOf(solidOf(seatClip.extrude(deck - base)).translate([0, 0, base]))
        seats.push(clipTo(place(solidOf(Manifold.intersection([solidOf(seat.translate([0, 0, deck])), clip]))), cell.mitre, 0))
      }
      const walls = solidOf(Manifold.difference([solidOf(Manifold.union(solids)), solidOf(Manifold.union(voids))]))
      const built = solidOf(Manifold.union([walls, ...seats]))
      return holes.length ? solidOf(Manifold.difference([built, ...holes])) : built
    }

    const inWorld = (value: Manifold, frame: PaintRackFrame) => {
      const [x, y] = toWorld(frame, [0, 0])
      return solidOf(solidOf(value.rotate([0, 0, -90 * frame.turns])).translate([x - layout.center.x, y - layout.center.y, 0]))
    }
    let solid: Manifold
    if (config.piece === undefined) {
      solid = solidOf(Manifold.union(layout.pieces.map((piece) => inWorld(buildPiece(piece), piece.frame))))
    } else {
      const piece = layout.pieces[config.piece]
      if (!piece) throw new Error('The rack has no such piece')
      const built = buildPiece(piece)
      const { min, max } = built.boundingBox()
      solid = solidOf(built.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, 0]))
    }
    const volume = solid.volume()
    const triangles = solid.numTri()
    return { mesh: solid.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
