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
const RAIL_WIDTH = 20
const RAIL_HEIGHT = 34
const RAIL_WALL = 2.4
const RAIL_KEY_LENGTH = 24
const KEY_WIDTH = 8
const KEY_THICKNESS = 3
const PUZZLE_HEIGHT = 1.1
const PUZZLE_NECK = 3.2
const PUZZLE_REACH = 4
const PUZZLE_HEAD_RADIUS = 3.2
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
    shelfThickness: 6,
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
  return ((columnGroups - 1) * rowGroups + (rowGroups - 1) * columnGroups) * Math.max(1, Math.round(config.shelfCount))
}

export function rackShelfDimensions(config: RackConfig) {
  return { width: Math.round(config.columns) * GRID, length: Math.round(config.rows) * GRID }
}

export const rackShelfLevels = rackSlotLevels

/** Front and rear rail positions, outside the usable Gridfinity footprint. */
export function rackBeamPositions(config: RackConfig): number[] {
  const length = Math.round(config.rows) * GRID
  return [-length / 2 - RAIL_WIDTH / 2, length / 2 + RAIL_WIDTH / 2]
}

export function rackReceiverProfile(config: RackConfig) {
  return GRIDFINITY_FOOT_PROFILE.toReversed().map(({ inset, z }) => ({
    depth: GRIDFINITY_FOOT_HEIGHT - z,
    size: GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
  }))
}

export function rackHardware(config: RackConfig) {
  const uprightSegments = 4
  return {
    printedUprights: uprightSegments,
    printedAnchors: 4,
    printedShelfRails: rackBeamPositions(config).length * config.shelfCount,
    printedLockPins: config.shelfCount * 4,
    purchasedParts: 0,
  }
}

export function rackStructuralAnalysis(config: RackConfig) {
  const span = rackShelfDimensions(config).width + POST_SIZE
  const loadSharingRibs = Math.max(2, rackBeamPositions(config).length)
  const force = (config.designLoadKg * 9.81 * 3) / loadSharingRibs
  // Hollow edge rails keep their depth outside the cargo footprint. Discount
  // the section at removable rail joints by 50%.
  const innerWidth = RAIL_WIDTH - RAIL_WALL * 2
  const innerHeight = RAIL_HEIGHT - RAIL_WALL * 2
  const inertia = ((RAIL_WIDTH * RAIL_HEIGHT ** 3 - innerWidth * innerHeight ** 3) / 12) * 0.5
  const stress = (((force * span) / 4) * (RAIL_HEIGHT / 2)) / inertia
  const deflection = (force * span ** 3) / (48 * 2_000 * inertia)
  const safetyFactor = 16 / stress
  return { stress, deflection, safetyFactor, passes: safetyFactor >= 2 && deflection <= 1 }
}

export function rackSlotLevels(config: RackConfig): number[] {
  const pitch = config.slotPitch === 7 ? 7 : 14
  return Array.from({ length: Math.max(0, Math.floor((config.height - pitch * 2) / pitch) + 1) }, (_, index) => pitch + index * pitch)
}

export function rackDimensions(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  if (config.view === 'assembled') return { width: width + POST_SIZE * 2, length: length + POST_SIZE * 2, height: config.height }
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
    height: Math.max(config.shelfThickness, FRAME_THICKNESS, POST_SIZE, RAIL_HEIGHT),
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
    if (config.height < 70 || levels.length < 3) throw new Error('Rack height must provide at least three shelf positions')
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
      const puzzle = (side: 'east' | 'west' | 'north' | 'south', female: boolean) => {
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
          ? cube([PUZZLE_REACH + 0.8, neck, height], [bridgeCenter, 0, height / 2 - (female ? 0.01 : 0)])
          : cube([neck, PUZZLE_REACH + 0.8, height], [0, bridgeCenter, height / 2 - (female ? 0.01 : 0)])
        const headBase = solid(Manifold.cylinder(height, radius, radius, 32, true))
        const head = solid(
          headBase.translate(horizontal ? [center, 0, height / 2 - (female ? 0.01 : 0)] : [0, center, height / 2 - (female ? 0.01 : 0)]),
        )
        return solid(Manifold.union(bridge, head))
      }
      const additions: Manifold[] = []
      const cutters: Manifold[] = [...receiverCutters, ...latticeOpenings]
      if (tile.column + tile.columns < columns) additions.push(puzzle('east', false))
      if (tile.row + tile.rows < rows) additions.push(puzzle('north', false))
      if (tile.column > 0) cutters.push(puzzle('west', true))
      if (tile.row > 0) cutters.push(puzzle('south', true))
      if (additions.length > 0) deck = solid(Manifold.union([deck, ...additions]))
      return solid(Manifold.difference([deck, ...cutters]))
    }

    const uprightPrint = () => {
      const post = cube([POST_SIZE, config.height, POST_SIZE])
      const hollow = cube([POST_SIZE - UPRIGHT_WALL * 2, config.height + 0.02, POST_SIZE - UPRIGHT_WALL * 2], [0, 0, 0])
      const hole = section(CrossSection.circle((LOCK_PIN_SIZE + config.fitClearance) / 2, 24))
      const cutters = levels.map((height) => {
        const drill = solid(hole.extrude(POST_SIZE + 0.02))
        return solid(drill.translate([0, -config.height / 2 + height, -POST_SIZE / 2 - 0.01]))
      })
      return solid(Manifold.difference([post, hollow, ...cutters]))
    }

    const uprightAssembled = () => {
      const post = cube([POST_SIZE, POST_SIZE, config.height])
      const hollow = cube([POST_SIZE - UPRIGHT_WALL * 2, POST_SIZE - UPRIGHT_WALL * 2, config.height + 0.02])
      return solid(Manifold.difference(post, hollow))
    }

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

    const splitRail = (railLength: number) => {
      const count = Math.ceil(railLength / (GRID * 2))
      const segmentLength = railLength / count
      return Array.from({ length: count }, (_, index) => {
        const length = segmentLength - config.fitClearance
        const outer = cube([length, RAIL_WIDTH, RAIL_HEIGHT])
        const inner = cube([length + 0.02, RAIL_WIDTH - RAIL_WALL * 2, RAIL_HEIGHT - RAIL_WALL * 2])
        const rail = solid(Manifold.difference(outer, inner))
        const cutters: Manifold[] = []
        if (index > 0)
          cutters.push(
            cube(
              [RAIL_KEY_LENGTH / 2 + config.fitClearance, KEY_WIDTH + config.fitClearance, KEY_THICKNESS + config.fitClearance],
              [-length / 2 + RAIL_KEY_LENGTH / 4, 0, -RAIL_HEIGHT / 2 + KEY_THICKNESS / 2 - 0.005],
            ),
          )
        if (index < count - 1)
          cutters.push(
            cube(
              [RAIL_KEY_LENGTH / 2 + config.fitClearance, KEY_WIDTH + config.fitClearance, KEY_THICKNESS + config.fitClearance],
              [length / 2 - RAIL_KEY_LENGTH / 4, 0, -RAIL_HEIGHT / 2 + KEY_THICKNESS / 2 - 0.005],
            ),
          )
        return cutters.length === 0 ? rail : solid(Manifold.difference([rail, ...cutters]))
      })
    }

    const lockPin = () => {
      const length = POST_SIZE + 4
      return solid(
        Manifold.union([
          cube([length, LOCK_PIN_SIZE, LOCK_PIN_SIZE]),
          cube([2, LOCK_PIN_SIZE + 3, LOCK_PIN_SIZE + 3], [-length / 2 - 1, 0, 0]),
          cube([1.5, LOCK_PIN_SIZE + 1, LOCK_PIN_SIZE + 1], [length / 2 - 0.5, 0, 0]),
        ]),
      )
    }

    const parts: Manifold[] = []
    const tiles = rackTiles(config)
    if (config.view === 'assembled') {
      const postX = (shelfWidth + POST_SIZE) / 2
      const postY = (shelfDepth + POST_SIZE) / 2
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
        for (const y of rackBeamPositions(config))
          parts.push(cube([shelfWidth + POST_SIZE, RAIL_WIDTH, RAIL_HEIGHT], [0, y, level + RAIL_HEIGHT / 2]))
        for (const x of [-postX, postX])
          for (const y of [-postY, postY])
            parts.push(cube([LOCK_PIN_SIZE, POST_SIZE + 4, LOCK_PIN_SIZE], [x, y, level + LOCK_PIN_SIZE / 2]))
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, level + RAIL_HEIGHT])))
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
      const shelfRailLength = shelfWidth + POST_SIZE
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
      const railKeyCount = Math.max(0, railSegments.length - 1) * rackBeamPositions(config).length * shelfCount
      for (let index = 0; index < railKeyCount; index++)
        parts.push(
          solid(
            cube([RAIL_KEY_LENGTH, KEY_WIDTH, KEY_THICKNESS]).translate([
              (index % 10) * (RAIL_KEY_LENGTH + 3),
              looseY + Math.floor(index / 10) * (KEY_WIDTH + 3),
              KEY_THICKNESS / 2,
            ]),
          ),
        )
      looseY += Math.ceil(railKeyCount / 10) * (KEY_WIDTH + 3) + PART_GAP
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
