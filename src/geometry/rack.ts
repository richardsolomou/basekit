import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from 'manifold-3d'
import {
  GRIDFINITY_CORNER_RADIUS as CORNER_RADIUS,
  GRIDFINITY_FOOT_HEIGHT,
  GRIDFINITY_FOOT_PROFILE,
  GRIDFINITY_FOOT_SIZE,
  GRIDFINITY_PITCH as GRID,
} from './gridfinity'
import type { BaseStats, RackConfig } from './types'

const FRAME_THICKNESS = 5
const UPRIGHT_WIDTH = 8
const POST_SIZE = 16
const LOCK_PIN_SIZE = 4
const UPRIGHT_WALL = 3
const ANCHOR_SIZE = 22
const ANCHOR_HEIGHT = 20
const ANCHOR_LEDGE = 14
const COLLAR_SIZE = 28
const COLLAR_PIN_HEIGHT = 5
const RAIL_WIDTH = 20
const RAIL_HEIGHT = 34
const COLLAR_WALL = 3
const COLLAR_HEIGHT = RAIL_HEIGHT + COLLAR_WALL * 2
const RAIL_INSERT = 5
const RAIL_WALL = 2.4
const RAIL_SPLICE_LENGTH = 36
const RAIL_SPLICE_HEIGHT = 16
const PUZZLE_HEIGHT = 10
const PUZZLE_NECK = 3.2
const PUZZLE_REACH = 4
const PUZZLE_HEAD_RADIUS = 3.2
const FLOOR_TONGUE_DEPTH = 8
const FLOOR_TONGUE_HEIGHT = 3
const FLOOR_TONGUE_BOTTOM = 1
const PART_GAP = 8
const PLA_DENSITY = 1.24e-3
const CELL_OPENING = 33.5

export interface RackBuildResult {
  mesh: Mesh
  stats: BaseStats
}

interface TileSpec {
  columns: number
  rows: number
  column: number
  row: number
}

export function defaultRackConfig(): RackConfig {
  return {
    kind: 'rack',
    columns: 7,
    rows: 5,
    height: 126,
    slotPitch: 14,
    shelfCount: 2,
    shelfThickness: 15,
    tileColumns: 2,
    tileRows: 2,
    gridfinityClearance: 0.15,
    fitClearance: 0.3,
    designLoadKg: 2,
    handle: false,
    view: 'assembled',
    segments: 160,
  }
}

export function rackName(config: RackConfig): string {
  return `gridfinity-box-floors-${Math.round(config.columns)}x${Math.round(config.rows)}-${Math.round(config.height)}mm-${Math.round(config.shelfCount)}-levels`
}

function chunks(total: number, maximum: number): number[] {
  const result: number[] = []
  for (let remaining = total; remaining > 0; remaining -= maximum) result.push(Math.min(maximum, remaining))
  return result
}

export function rackTiles(config: RackConfig): TileSpec[] {
  const columnChunks = chunks(Math.max(1, Math.round(config.columns)), Math.max(1, Math.round(config.tileColumns)))
  const rowChunks = chunks(Math.max(1, Math.round(config.rows)), Math.max(1, Math.round(config.tileRows)))
  let rowStart = 0
  const tiles: TileSpec[] = []
  for (const rows of rowChunks) {
    let columnStart = 0
    for (const columns of columnChunks) {
      tiles.push({ columns, rows, column: columnStart, row: rowStart })
      columnStart += columns
    }
    rowStart += rows
  }
  return tiles
}

export function rackPuzzleJointCount(config: RackConfig): number {
  const columnGroups = chunks(Math.max(1, Math.round(config.columns)), Math.max(1, Math.round(config.tileColumns))).length
  const rowGroups = chunks(Math.max(1, Math.round(config.rows)), Math.max(1, Math.round(config.tileRows))).length
  return (
    ((columnGroups - 1) * Math.round(config.rows) + (rowGroups - 1) * Math.round(config.columns)) *
    Math.max(1, Math.round(config.shelfCount))
  )
}

export function rackShelfDimensions(config: RackConfig) {
  return { width: Math.round(config.columns) * GRID, length: Math.round(config.rows) * GRID }
}

export const rackShelfLevels = rackSlotLevels

/** Front and rear rail positions, outside the usable Gridfinity footprint. */
export function rackBeamPositions(config: RackConfig): number[] {
  const length = Math.round(config.rows) * GRID
  return [-length / 2 - COLLAR_SIZE / 2, length / 2 + COLLAR_SIZE / 2]
}

export function rackReceiverProfile(config: RackConfig) {
  return GRIDFINITY_FOOT_PROFILE.toReversed().map(({ inset, z }) => ({
    depth: GRIDFINITY_FOOT_HEIGHT - z,
    size: GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
  }))
}

export function rackConnectionDimensions(config: RackConfig) {
  const railGap = (COLLAR_SIZE - RAIL_WIDTH) / 2
  return {
    puzzleHeight: PUZZLE_HEIGHT,
    materialBelowSocket: config.shelfThickness - GRIDFINITY_FOOT_HEIGHT,
    puzzleRoof: config.shelfThickness - PUZZLE_HEIGHT,
    tongueEngagement: FLOOR_TONGUE_DEPTH - railGap,
    collarRailInsert: RAIL_INSERT,
    collarBearing: COLLAR_WALL,
    spliceOverlap: RAIL_SPLICE_LENGTH / 2,
    pinClearance: LOCK_PIN_SIZE + config.fitClearance - (LOCK_PIN_SIZE - 0.2),
  }
}

export function rackHardware(config: RackConfig) {
  const uprightSegments = 4
  const railSegments = Math.ceil((rackShelfDimensions(config).width + RAIL_INSERT * 2) / (GRID * 2))
  const rails = rackBeamPositions(config).length * config.shelfCount
  return {
    printedUprights: uprightSegments,
    printedAnchors: 4,
    printedShelfRails: rails,
    printedShelfCollars: config.shelfCount * 4,
    printedSpliceSleeves: Math.max(0, railSegments - 1) * rails,
    printedLockPins: config.shelfCount * 4,
    purchasedParts: 0,
  }
}

export function rackStructuralAnalysis(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  const span = width + COLLAR_SIZE
  const loadSharingRibs = Math.max(2, rackBeamPositions(config).length)
  const force = (config.designLoadKg * 9.81 * 3) / loadSharingRibs
  // Hollow edge rails keep their depth outside the cargo footprint. Discount
  // the section at removable rail joints by 50%.
  const innerWidth = RAIL_WIDTH - RAIL_WALL * 2
  const innerHeight = RAIL_HEIGHT - RAIL_WALL * 2
  const inertia = ((RAIL_WIDTH * RAIL_HEIGHT ** 3 - innerWidth * innerHeight ** 3) / 12) * 0.5
  const railStress = (((force * span) / 4) * (RAIL_HEIGHT / 2)) / inertia
  const railDeflection = (force * span ** 3) / (48 * 2_000 * inertia)
  const floorForce = (config.designLoadKg * 9.81 * 3) / (Math.max(1, Math.round(config.columns)) + 1)
  const floorInertia = (((GRID - CELL_OPENING) * config.shelfThickness ** 3) / 12) * 0.5
  const floorStress = (((floorForce * length) / 4) * (config.shelfThickness / 2)) / floorInertia
  const floorDeflection = (floorForce * length ** 3) / (48 * 2_000 * floorInertia)
  const transportForce = config.designLoadKg * 9.81 * 3
  const pinStress = transportForce / (4 * (LOCK_PIN_SIZE - 0.2) ** 2)
  const jointConnectors = Math.max(1, Math.min(Math.round(config.columns), Math.round(config.rows)))
  const puzzleStress = transportForce / (jointConnectors * PUZZLE_NECK * PUZZLE_HEIGHT)
  const collarBearingStress = transportForce / (4 * RAIL_INSERT * RAIL_WIDTH)
  const stress = Math.max(railStress, floorStress)
  const deflection = Math.max(railDeflection, floorDeflection)
  const safetyFactor = Math.min(16 / stress, 6 / pinStress, 6 / puzzleStress, 8 / collarBearingStress)
  return {
    stress,
    deflection,
    safetyFactor,
    railDeflection,
    floorDeflection,
    pinStress,
    puzzleStress,
    collarBearingStress,
    passes: safetyFactor >= 2 && deflection <= 1,
  }
}

export function rackSlotLevels(config: RackConfig): number[] {
  const pitch = config.slotPitch === 7 ? 7 : 14
  const highestPin = config.height - (COLLAR_HEIGHT - COLLAR_PIN_HEIGHT)
  return Array.from({ length: Math.max(0, Math.floor((highestPin - pitch) / pitch) + 1) }, (_, index) => pitch + index * pitch)
}

export function rackDimensions(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  if (config.view === 'assembled') return { width: width + COLLAR_SIZE * 2, length: length + COLLAR_SIZE * 2, height: config.height }
  const tiles = rackTiles(config)
  const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID))
  const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID))
  const partsAcross = Math.ceil(Math.sqrt(tiles.length * config.shelfCount))
  const partRows = Math.ceil((tiles.length * config.shelfCount) / partsAcross)
  const tileAreaWidth = partsAcross * (widestTile + PART_GAP)
  const tileAreaLength = partRows * (deepestTile + PART_GAP)
  return {
    width: Math.max(tileAreaWidth, length * 2 + PART_GAP, width + UPRIGHT_WIDTH * 2),
    length: tileAreaLength + config.height * 2 + PART_GAP * 4,
    height: Math.max(config.shelfThickness, FRAME_THICKNESS, POST_SIZE, RAIL_HEIGHT, COLLAR_HEIGHT),
  }
}

export function buildRack(wasm: ManifoldToplevel, config: RackConfig): RackBuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solid = (value: Manifold) => own(value)
  const cube = (size: [number, number, number], offset: [number, number, number] = [0, 0, 0]) => {
    const base = solid(Manifold.cube(size, true))
    return offset.every((value) => value === 0) ? base : solid(base.translate(offset))
  }
  const rounded = (width: number, depth: number, radius: number) => {
    const core = section(CrossSection.square([width - radius * 2, depth - radius * 2], true))
    return section(core.offset(radius, 'Round', 2, 32))
  }

  try {
    const columns = Math.max(1, Math.round(config.columns))
    const rows = Math.max(1, Math.round(config.rows))
    const shelfCount = Math.max(1, Math.round(config.shelfCount))
    const shelfWidth = columns * GRID
    const shelfDepth = rows * GRID
    const levels = rackSlotLevels(config)
    if (levels.length < 3) throw new Error('Rack height must provide at least three complete shelf positions')
    if (![7, 14].includes(config.slotPitch)) throw new Error('Shelf slot pitch must be 7 or 14 mm')
    if (config.shelfThickness < GRIDFINITY_FOOT_HEIGHT + 0.8)
      throw new Error('Rack shelves must leave at least 0.8 mm below the Gridfinity foot profile')
    if (!rackStructuralAnalysis(config).passes) throw new Error('The selected shelf load exceeds the integrated-floor design screen')

    const tileSolid = (tile: TileSpec) => {
      const width = tile.columns * GRID
      const depth = tile.rows * GRID
      const outline = rounded(width, depth, Math.min(CORNER_RADIUS, width / 2 - 0.01, depth / 2 - 0.01))
      let deck = solid(outline.extrude(config.shelfThickness))
      const receiverCutters: Manifold[] = []
      const latticeOpenings: Manifold[] = []
      const pointsAt = (shape: CrossSection, z: number): [number, number, number][] =>
        shape.toPolygons().flatMap((ring) => ring.map(([x, y]): [number, number, number] => [x, y, z]))
      for (let row = 0; row < tile.rows; row++) {
        for (let column = 0; column < tile.columns; column++) {
          const x = (column - (tile.columns - 1) / 2) * GRID
          const y = (row - (tile.rows - 1) / 2) * GRID
          const reversed = GRIDFINITY_FOOT_PROFILE.toReversed()
          const socketSegments: Manifold[] = []
          for (let index = 0; index < reversed.length - 1; index++) {
            const from = reversed[index]
            const to = reversed[index + 1]
            const makeOutline = ({ inset }: (typeof reversed)[number]) =>
              rounded(
                GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
                GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
                Math.max(0.01, CORNER_RADIUS - inset),
              )
            const fromZ = config.shelfThickness - (GRIDFINITY_FOOT_HEIGHT - from.z) + (index === 0 ? 0.01 : 0)
            const toZ = config.shelfThickness - (GRIDFINITY_FOOT_HEIGHT - to.z)
            socketSegments.push(solid(Manifold.hull([...pointsAt(makeOutline(from), fromZ), ...pointsAt(makeOutline(to), toZ)])))
          }
          const socket = solid(Manifold.union(socketSegments))
          receiverCutters.push(solid(socket.translate([x, y, 0])))
          const opening = rounded(CELL_OPENING, CELL_OPENING, 2)
          const openingCut = solid(opening.extrude(config.shelfThickness + 0.02))
          latticeOpenings.push(solid(openingCut.translate([x, y, -0.01])))
        }
      }
      const puzzle = (side: 'east' | 'west' | 'north' | 'south', female: boolean, along: number) => {
        const clearance = female ? config.fitClearance : 0
        const radius = PUZZLE_HEAD_RADIUS + clearance
        const neck = PUZZLE_NECK + clearance * 2
        const height = PUZZLE_HEIGHT + (female ? 0.02 : 0)
        const horizontal = side === 'east' || side === 'west'
        const sign = side === 'east' || side === 'north' ? 1 : -1
        const edge = horizontal ? width / 2 : depth / 2
        const center = sign * (edge + (female ? -PUZZLE_REACH : PUZZLE_REACH))
        const bridgeCenter = sign * (edge + (female ? -PUZZLE_REACH / 2 : PUZZLE_REACH / 2))
        const bridge = horizontal
          ? cube([PUZZLE_REACH + 0.8, neck, height], [bridgeCenter, along, height / 2 - (female ? 0.01 : 0)])
          : cube([neck, PUZZLE_REACH + 0.8, height], [along, bridgeCenter, height / 2 - (female ? 0.01 : 0)])
        const headBase = solid(Manifold.cylinder(height, radius, radius, 32, true))
        const head = solid(
          headBase.translate(
            horizontal ? [center, along, height / 2 - (female ? 0.01 : 0)] : [along, center, height / 2 - (female ? 0.01 : 0)],
          ),
        )
        return solid(Manifold.union(bridge, head))
      }
      const additions: Manifold[] = []
      const cutters: Manifold[] = [...receiverCutters, ...latticeOpenings]
      for (let row = 0; row < tile.rows; row++) {
        const y = (row - (tile.rows - 1) / 2) * GRID
        if (tile.column + tile.columns < columns) additions.push(puzzle('east', false, y))
        if (tile.column > 0) cutters.push(puzzle('west', true, y))
      }
      for (let column = 0; column < tile.columns; column++) {
        const x = (column - (tile.columns - 1) / 2) * GRID
        if (tile.row + tile.rows < rows) additions.push(puzzle('north', false, x))
        if (tile.row > 0) cutters.push(puzzle('south', true, x))
      }
      const tongue = (north: boolean) =>
        cube(
          [width - 2, FLOOR_TONGUE_DEPTH + 0.4, FLOOR_TONGUE_HEIGHT],
          [0, (north ? 1 : -1) * (depth / 2 + FLOOR_TONGUE_DEPTH / 2), FLOOR_TONGUE_BOTTOM + FLOOR_TONGUE_HEIGHT / 2],
        )
      if (tile.row === 0) additions.push(tongue(false))
      if (tile.row + tile.rows === rows) additions.push(tongue(true))
      if (additions.length > 0) deck = solid(Manifold.union([deck, ...additions]))
      return solid(Manifold.difference([deck, ...cutters]))
    }

    const uprightPrint = () => {
      const post = cube([POST_SIZE, config.height, POST_SIZE])
      const hollow = cube([POST_SIZE - UPRIGHT_WALL * 2, config.height + 0.02, POST_SIZE - UPRIGHT_WALL * 2], [0, 0, 0])
      const cutters = levels.map((height) =>
        cube(
          [LOCK_PIN_SIZE + config.fitClearance, LOCK_PIN_SIZE + config.fitClearance, POST_SIZE + 0.02],
          [0, -config.height / 2 + height, 0],
        ),
      )
      return solid(Manifold.difference([post, hollow, ...cutters]))
    }

    const uprightAssembled = () => solid(uprightPrint().rotate([90, 0, 0]))

    const anchorShoe = () => {
      const body = cube([ANCHOR_SIZE, ANCHOR_SIZE, ANCHOR_HEIGHT], [0, 0, ANCHOR_HEIGHT / 2])
      const socket = cube(
        [POST_SIZE + config.fitClearance, POST_SIZE + config.fitClearance, ANCHOR_HEIGHT - 3 + 0.01],
        [0, 0, 3 + (ANCHOR_HEIGHT - 3) / 2],
      )
      const ledgeX = cube([ANCHOR_LEDGE, ANCHOR_SIZE, 3], [-(ANCHOR_SIZE + ANCHOR_LEDGE) / 2, 0, 1.5])
      const ledgeY = cube([ANCHOR_SIZE, ANCHOR_LEDGE, 3], [0, -(ANCHOR_SIZE + ANCHOR_LEDGE) / 2, 1.5])
      return solid(Manifold.union([solid(Manifold.difference(body, socket)), ledgeX, ledgeY]))
    }

    const railSolid = (length: number) => {
      const outer = cube([length, RAIL_WIDTH, RAIL_HEIGHT])
      const inner = cube([length + 0.02, RAIL_WIDTH - RAIL_WALL * 2, RAIL_HEIGHT - RAIL_WALL * 2])
      const rail = solid(Manifold.difference(outer, inner))
      const tileBottom = RAIL_HEIGHT - config.shelfThickness
      const groove = cube(
        [length + 0.02, RAIL_WALL + FLOOR_TONGUE_DEPTH + config.fitClearance + 0.02, FLOOR_TONGUE_HEIGHT + config.fitClearance],
        [
          0,
          -RAIL_WIDTH / 2 + (RAIL_WALL + FLOOR_TONGUE_DEPTH + config.fitClearance) / 2 - 0.01,
          -RAIL_HEIGHT / 2 + tileBottom + FLOOR_TONGUE_BOTTOM + FLOOR_TONGUE_HEIGHT / 2,
        ],
      )
      return solid(Manifold.difference(rail, groove))
    }

    const splitRail = (railLength: number) => {
      const count = Math.ceil(railLength / (GRID * 2))
      const segmentLength = railLength / count
      return Array.from({ length: count }, () => {
        const length = segmentLength - config.fitClearance
        return railSolid(length)
      })
    }

    const spliceSleeve = () => {
      const width = RAIL_WIDTH - RAIL_WALL * 2 - config.fitClearance
      const outer = cube([RAIL_SPLICE_LENGTH, width, RAIL_SPLICE_HEIGHT])
      const inner = cube([RAIL_SPLICE_LENGTH + 0.02, width - 4, RAIL_SPLICE_HEIGHT - 4])
      return solid(Manifold.difference(outer, inner))
    }

    const shelfCollar = () => {
      const body = cube([COLLAR_SIZE, COLLAR_SIZE, COLLAR_HEIGHT], [0, 0, COLLAR_HEIGHT / 2])
      const post = cube([POST_SIZE + config.fitClearance, POST_SIZE + config.fitClearance, COLLAR_HEIGHT + 0.02], [0, 0, COLLAR_HEIGHT / 2])
      const railSocket = cube(
        [RAIL_INSERT + 0.02, RAIL_WIDTH + config.fitClearance, RAIL_HEIGHT + config.fitClearance],
        [-COLLAR_SIZE / 2 + RAIL_INSERT / 2 - 0.01, 0, COLLAR_WALL + RAIL_HEIGHT / 2],
      )
      const pin = cube(
        [LOCK_PIN_SIZE + config.fitClearance, COLLAR_SIZE + 0.02, LOCK_PIN_SIZE + config.fitClearance],
        [0, 0, COLLAR_PIN_HEIGHT],
      )
      return solid(Manifold.difference([body, post, railSocket, pin]))
    }

    const lockPin = () => {
      const length = COLLAR_SIZE + 4
      const shaft = cube([length, LOCK_PIN_SIZE - 0.2, LOCK_PIN_SIZE - 0.2])
      const head = cube([2, LOCK_PIN_SIZE + 3, LOCK_PIN_SIZE + 3], [-length / 2 - 1, 0, 0])
      const barbs = [
        cube([2, 0.8, LOCK_PIN_SIZE - 0.2], [length / 2 - 1, 2.2, 0]),
        cube([2, 0.8, LOCK_PIN_SIZE - 0.2], [length / 2 - 1, -2.2, 0]),
      ]
      const blank = solid(Manifold.union([shaft, head, ...barbs]))
      const split = cube([8, 1.2, LOCK_PIN_SIZE + 2], [length / 2 - 4, 0, 0])
      return solid(Manifold.difference(blank, split))
    }

    const parts: Manifold[] = []
    const tiles = rackTiles(config)
    if (config.view === 'assembled') {
      const postX = shelfWidth / 2 + COLLAR_SIZE / 2
      const postY = shelfDepth / 2 + COLLAR_SIZE / 2
      for (const x of [-postX, postX])
        for (const y of [-postY, postY]) {
          parts.push(solid(uprightAssembled().translate([x, y, config.height / 2])))
          const angle = x > 0 ? (y > 0 ? 0 : 90) : y > 0 ? -90 : 180
          parts.push(solid(anchorShoe().rotate([0, 0, angle]).translate([x, y, 0])))
        }
      // The bottom level is the user's existing Gridfinity insert. It is
      // previewed for context but never included in the print layout.
      for (const tile of tiles) {
        const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID) / 2
        const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID) / 2
        parts.push(solid(tileSolid(tile).translate([x, y, 3])))
      }
      const shownLevels = Array.from(
        { length: shelfCount },
        (_, index) => levels[Math.round((index * (levels.length - 1)) / Math.max(1, shelfCount - 1))],
      )
      for (const level of shownLevels) {
        const collarBottom = level - COLLAR_PIN_HEIGHT
        const railBottom = collarBottom + COLLAR_WALL
        const railLength = shelfWidth + RAIL_INSERT * 2
        for (const y of rackBeamPositions(config)) {
          const rail = y > 0 ? railSolid(railLength) : solid(railSolid(railLength).rotate([0, 0, 180]))
          parts.push(solid(rail.translate([0, y, railBottom + RAIL_HEIGHT / 2])))
        }
        for (const x of [-postX, postX])
          for (const y of [-postY, postY]) {
            const collar = x > 0 ? shelfCollar() : solid(shelfCollar().rotate([0, 0, 180]))
            parts.push(solid(collar.translate([x, y, collarBottom])))
            parts.push(solid(lockPin().rotate([0, 0, 90]).translate([x, y, level])))
          }
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, railBottom + RAIL_HEIGHT - config.shelfThickness])))
        }
      }
    } else {
      const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID))
      const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID))
      const allTiles = Array.from({ length: shelfCount }, () => tiles).flat()
      const across = Math.ceil(Math.sqrt(allTiles.length))
      const rowsOfTiles = Math.ceil(allTiles.length / across)
      allTiles.forEach((tile, index) => {
        const x = (index % across) * (widestTile + PART_GAP)
        const y = Math.floor(index / across) * (deepestTile + PART_GAP)
        parts.push(solid(tileSolid(tile).translate([x, y, 0])))
      })
      const upright = uprightPrint()
      const frameY = rowsOfTiles * (deepestTile + PART_GAP) + config.height / 2
      for (let index = 0; index < 4; index++) parts.push(solid(upright.translate([index * (POST_SIZE + PART_GAP), frameY, POST_SIZE / 2])))
      const shoe = anchorShoe()
      for (let index = 0; index < 4; index++)
        parts.push(solid(shoe.translate([index * (ANCHOR_SIZE + ANCHOR_LEDGE + PART_GAP), frameY + config.height / 2 + PART_GAP, 0])))
      let looseY = frameY + config.height / 2 + ANCHOR_SIZE + PART_GAP * 2
      const shelfRailLength = shelfWidth + RAIL_INSERT * 2
      const railSegments = splitRail(shelfRailLength)
      for (let shelf = 0; shelf < shelfCount; shelf++) {
        for (let rail = 0; rail < rackBeamPositions(config).length; rail++) {
          let x = 0
          for (const segment of railSegments) {
            parts.push(solid(segment.translate([x, looseY, RAIL_HEIGHT / 2])))
            x += shelfRailLength / railSegments.length + PART_GAP / 2
          }
          looseY += RAIL_WIDTH + PART_GAP / 2
        }
      }
      const sleeveCount = Math.max(0, railSegments.length - 1) * rackBeamPositions(config).length * shelfCount
      const sleeve = spliceSleeve()
      for (let index = 0; index < sleeveCount; index++)
        parts.push(
          solid(
            sleeve.translate([
              (index % 10) * (RAIL_SPLICE_LENGTH + 3),
              looseY + Math.floor(index / 10) * (RAIL_WIDTH + 3),
              RAIL_SPLICE_HEIGHT / 2,
            ]),
          ),
        )
      looseY += Math.ceil(sleeveCount / 10) * (RAIL_WIDTH + 3) + PART_GAP
      const collar = shelfCollar()
      for (let index = 0; index < shelfCount * 4; index++)
        parts.push(
          solid(collar.translate([(index % 10) * (COLLAR_SIZE + PART_GAP), looseY + Math.floor(index / 10) * (COLLAR_SIZE + PART_GAP), 0])),
        )
      looseY += Math.ceil((shelfCount * 4) / 10) * (COLLAR_SIZE + PART_GAP) + PART_GAP
      for (let index = 0; index < shelfCount * 4; index++)
        parts.push(
          solid(
            lockPin().translate([
              (index % 12) * (POST_SIZE + 7),
              looseY + Math.floor(index / 12) * (LOCK_PIN_SIZE + 4),
              (LOCK_PIN_SIZE + 3) / 2,
            ]),
          ),
        )
      looseY += Math.ceil((shelfCount * 4) / 12) * (LOCK_PIN_SIZE + 4) + PART_GAP
    }

    const kit = solid(Manifold.union(parts))
    const volume = kit.volume()
    const triangles = kit.numTri()
    return { mesh: kit.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
