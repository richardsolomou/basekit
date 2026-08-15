import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from 'manifold-3d'
import type { BaseStats, RackConfig } from './types'

const GRID = 42
const GAP = 0.5
const CORNER_RADIUS = 3.75
const RECEIVER_DEPTH = 2.8
const RECEIVER_INSET = 2.15
const FRAME_THICKNESS = 5
const POST_SIZE = 10
const ROD_DIAMETER = 6
const ROD_CLEARANCE = 0.5
const M3_CLEARANCE = 3.4
const M4_CLEARANCE = 4.5
const BEAM_WIDTH = 8
const BEAM_HEIGHT = 5
const LATTICE_OPENING = 30
const KEY_LENGTH = 14
const KEY_WIDTH = 5
const KEY_THICKNESS = 1.2
const PART_GAP = 8
const PLA_DENSITY = 1.24e-3

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
    columns: 4,
    rows: 4,
    height: 196,
    shelfCount: 3,
    shelfThickness: 5.5,
    tileColumns: 2,
    tileRows: 2,
    fitClearance: 0.3,
    handle: true,
    view: 'assembled',
    segments: 160,
  }
}

export function rackName(config: RackConfig): string {
  return `gridfinity-rack-${Math.round(config.columns)}x${Math.round(config.rows)}-${Math.round(config.height)}mm-${Math.round(config.shelfCount)}-shelves`
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

export function rackShelfDimensions(config: RackConfig) {
  return { width: Math.round(config.columns) * GRID - GAP, length: Math.round(config.rows) * GRID - GAP }
}

export function rackShelfLevels(config: RackConfig): number[] {
  const margin = 14
  return Array.from(
    { length: config.shelfCount },
    (_, index) => margin + (index * (config.height - margin * 2)) / Math.max(1, config.shelfCount - 1),
  )
}

export function rackHardware(config: RackConfig) {
  const shelfCorners = config.shelfCount * 4
  const { width, length } = rackShelfDimensions(config)
  const splitJoints = (barLength: number) => Math.max(0, Math.ceil(barLength / (GRID * 2)) - 1)
  const m3Joints = config.shelfCount * 2 * splitJoints(width + POST_SIZE) + 4 * splitJoints(width + POST_SIZE * 2) + 4 * splitJoints(length)
  const m3Mounts = config.shelfCount * 4 + 16
  return {
    m6Rods: 4,
    m6RodLength: config.height,
    m6Nuts: shelfCorners * 2 + 16,
    m6Washers: shelfCorners * 2 + 16,
    m4Bolts: config.handle ? 2 : 0,
    m4Nuts: config.handle ? 2 : 0,
    m3Bolts: m3Joints * 2 + m3Mounts,
    m3Nuts: m3Joints * 2 + m3Mounts,
  }
}

export function rackDimensions(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  if (config.view === 'assembled') return { width: width + POST_SIZE * 2, length, height: config.height + (config.handle ? 38 : 0) }
  const tiles = rackTiles(config)
  const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID - GAP))
  const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID - GAP))
  const partsAcross = Math.ceil(Math.sqrt(tiles.length * config.shelfCount))
  const partRows = Math.ceil((tiles.length * config.shelfCount) / partsAcross)
  const tileAreaWidth = partsAcross * (widestTile + PART_GAP)
  const tileAreaLength = partRows * (deepestTile + PART_GAP)
  return {
    width: Math.max(tileAreaWidth, length * 2 + PART_GAP, width + POST_SIZE * 2),
    length: tileAreaLength + config.height * 2 + PART_GAP * 4,
    height: Math.max(config.shelfThickness, 10),
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
    const shelfCount = Math.max(3, Math.round(config.shelfCount))
    const shelfWidth = columns * GRID - GAP
    const shelfDepth = rows * GRID - GAP
    const levels = rackShelfLevels(config)
    if (config.height < 70) throw new Error('Rack height must be at least 70 mm')
    if (config.shelfThickness < 5) throw new Error('Rack shelves must be at least 5 mm thick')

    const tileSolid = (tile: TileSpec) => {
      const width = tile.columns * GRID - GAP
      const depth = tile.rows * GRID - GAP
      const outline = rounded(width, depth, Math.min(CORNER_RADIUS, width / 2 - 0.01, depth / 2 - 0.01))
      const deck = solid(outline.extrude(config.shelfThickness))
      const receiverCutters: Manifold[] = []
      const latticeOpenings: Manifold[] = []
      for (let row = 0; row < tile.rows; row++) {
        for (let column = 0; column < tile.columns; column++) {
          const x = (column - (tile.columns - 1) / 2) * GRID
          const y = (row - (tile.rows - 1) / 2) * GRID
          const receiver = rounded(
            GRID - GAP + 0.7 - RECEIVER_INSET * 2,
            GRID - GAP + 0.7 - RECEIVER_INSET * 2,
            CORNER_RADIUS - RECEIVER_INSET,
          )
          const receiverCut = solid(receiver.extrude(RECEIVER_DEPTH + 0.01))
          receiverCutters.push(solid(receiverCut.translate([x, y, config.shelfThickness - RECEIVER_DEPTH])))
          const opening = rounded(LATTICE_OPENING, LATTICE_OPENING, 2)
          const openingCut = solid(opening.extrude(config.shelfThickness + 0.02))
          latticeOpenings.push(solid(openingCut.translate([x, y, -0.01])))
        }
      }
      const keyDepth = KEY_THICKNESS + config.fitClearance
      const halfKey = KEY_LENGTH / 2 + config.fitClearance
      const keyways = [
        cube([KEY_WIDTH + config.fitClearance, halfKey, keyDepth], [0, -depth / 2 + halfKey / 2, keyDepth / 2 - 0.005]),
        cube([KEY_WIDTH + config.fitClearance, halfKey, keyDepth], [0, depth / 2 - halfKey / 2, keyDepth / 2 - 0.005]),
        cube([halfKey, KEY_WIDTH + config.fitClearance, keyDepth], [-width / 2 + halfKey / 2, 0, keyDepth / 2 - 0.005]),
        cube([halfKey, KEY_WIDTH + config.fitClearance, keyDepth], [width / 2 - halfKey / 2, 0, keyDepth / 2 - 0.005]),
      ]
      return solid(Manifold.difference([deck, ...receiverCutters, ...latticeOpenings, ...keyways]))
    }

    const verticalDrill = (diameter: number, height: number, z = -0.01) => {
      const outline = section(CrossSection.circle(diameter / 2, 32))
      const drill = solid(outline.extrude(height + 0.02))
      return solid(drill.translate([0, 0, z]))
    }

    const cornerBlock = (height: number) => {
      const block = cube([18, 18, height], [0, 0, height / 2])
      const rod = verticalDrill(ROD_DIAMETER + ROD_CLEARANCE, height)
      const screw = verticalDrill(M3_CLEARANCE, height)
      const movedScrew = solid(screw.translate([6, 0, 0]))
      const secondScrew = verticalDrill(M3_CLEARANCE, height)
      const movedSecondScrew = solid(secondScrew.translate([0, 6, 0]))
      return solid(Manifold.difference([block, rod, movedScrew, movedSecondScrew]))
    }

    const splitBar = (barLength: number) => {
      const count = Math.ceil(barLength / (GRID * 2))
      const segmentLength = barLength / count
      return Array.from({ length: count }, (_, index) => {
        const length = segmentLength - config.fitClearance
        const beam = cube([length, BEAM_WIDTH, BEAM_HEIGHT])
        const keyDepth = KEY_THICKNESS + config.fitClearance
        const cutters: Manifold[] = []
        if (index > 0)
          cutters.push(
            cube(
              [KEY_LENGTH / 2 + config.fitClearance, KEY_WIDTH + config.fitClearance, keyDepth],
              [-length / 2 + KEY_LENGTH / 4, 0, -BEAM_HEIGHT / 2 + keyDepth / 2 - 0.005],
            ),
          )
        if (index > 0) {
          const drill = verticalDrill(M3_CLEARANCE, BEAM_HEIGHT, -BEAM_HEIGHT / 2 - 0.01)
          cutters.push(solid(drill.translate([-length / 2 + 4, 0, 0])))
        }
        if (index < count - 1)
          cutters.push(
            cube(
              [KEY_LENGTH / 2 + config.fitClearance, KEY_WIDTH + config.fitClearance, keyDepth],
              [length / 2 - KEY_LENGTH / 4, 0, -BEAM_HEIGHT / 2 + keyDepth / 2 - 0.005],
            ),
          )
        if (index < count - 1) {
          const drill = verticalDrill(M3_CLEARANCE, BEAM_HEIGHT, -BEAM_HEIGHT / 2 - 0.01)
          cutters.push(solid(drill.translate([length / 2 - 4, 0, 0])))
        }
        if (index === 0) {
          const drill = verticalDrill(M3_CLEARANCE, BEAM_HEIGHT, -BEAM_HEIGHT / 2 - 0.01)
          cutters.push(solid(drill.translate([-length / 2 + 7, 0, 0])))
        }
        if (index === count - 1) {
          const drill = verticalDrill(M3_CLEARANCE, BEAM_HEIGHT, -BEAM_HEIGHT / 2 - 0.01)
          cutters.push(solid(drill.translate([length / 2 - 7, 0, 0])))
        }
        return cutters.length === 0 ? beam : solid(Manifold.difference([beam, ...cutters]))
      })
    }

    const key = () => cube([KEY_LENGTH, KEY_WIDTH, KEY_THICKNESS])
    const handlePrint = () => {
      const handle = solid(
        Manifold.union([
          cube([100, 8, FRAME_THICKNESS], [0, 15, FRAME_THICKNESS / 2]),
          cube([8, 38, FRAME_THICKNESS], [-46, 0, FRAME_THICKNESS / 2]),
          cube([8, 38, FRAME_THICKNESS], [46, 0, FRAME_THICKNESS / 2]),
        ]),
      )
      const leftBolt = verticalDrill(M4_CLEARANCE, FRAME_THICKNESS)
      const rightBolt = verticalDrill(M4_CLEARANCE, FRAME_THICKNESS)
      return solid(Manifold.difference([handle, solid(leftBolt.translate([-46, -14, 0])), solid(rightBolt.translate([46, -14, 0]))]))
    }

    const parts: Manifold[] = []
    const tiles = rackTiles(config)
    if (config.view === 'assembled') {
      const postX = (shelfWidth + POST_SIZE) / 2
      const postY = (shelfDepth - POST_SIZE) / 2
      const rodOutline = section(CrossSection.circle(ROD_DIAMETER / 2, 32))
      for (const x of [-postX, postX]) {
        for (const y of [-postY, postY]) {
          const rod = solid(rodOutline.extrude(config.height))
          parts.push(solid(rod.translate([x, y, 0])))
        }
      }
      for (const z of [POST_SIZE / 2, config.height - POST_SIZE / 2]) {
        parts.push(cube([shelfWidth + POST_SIZE * 2, POST_SIZE, POST_SIZE], [0, -postY, z]))
        parts.push(cube([shelfWidth + POST_SIZE * 2, POST_SIZE, POST_SIZE], [0, postY, z]))
        parts.push(cube([POST_SIZE, shelfDepth, POST_SIZE], [-postX, 0, z]))
        parts.push(cube([POST_SIZE, shelfDepth, POST_SIZE], [postX, 0, z]))
        for (const x of [-postX, postX]) for (const y of [-postY, postY]) parts.push(solid(cornerBlock(10).translate([x, y, z - 5])))
      }
      const shownLevels = Array.from(
        { length: shelfCount },
        (_, index) => levels[Math.round((index * (levels.length - 1)) / Math.max(1, shelfCount - 1))],
      )
      for (const level of shownLevels) {
        for (const y of [-postY, postY])
          parts.push(cube([shelfWidth + POST_SIZE, BEAM_WIDTH, BEAM_HEIGHT], [0, y, level + BEAM_HEIGHT / 2]))
        for (const x of [-postX, postX]) for (const y of [-postY, postY]) parts.push(solid(cornerBlock(6).translate([x, y, level])))
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID - GAP) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID - GAP) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, level + BEAM_HEIGHT])))
        }
      }
      if (config.handle) {
        parts.push(cube([100, 8, 8], [0, 0, config.height + 34]))
        parts.push(cube([8, 8, 40], [-46, 0, config.height + 15]))
        parts.push(cube([8, 8, 40], [46, 0, config.height + 15]))
      }
    } else {
      const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID - GAP))
      const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID - GAP))
      const allTiles = Array.from({ length: shelfCount }, () => tiles).flat()
      const across = Math.ceil(Math.sqrt(allTiles.length))
      const rowsOfTiles = Math.ceil(allTiles.length / across)
      allTiles.forEach((tile, index) => {
        const x = (index % across) * (widestTile + PART_GAP)
        const y = Math.floor(index / across) * (deepestTile + PART_GAP)
        parts.push(solid(tileSolid(tile).translate([x, y, 0])))
      })
      const shelfBeamLength = shelfWidth + POST_SIZE
      const segments = splitBar(shelfBeamLength)
      let looseY = rowsOfTiles * (deepestTile + PART_GAP) + BEAM_WIDTH / 2
      for (let shelf = 0; shelf < shelfCount; shelf++) {
        for (let beam = 0; beam < 2; beam++) {
          let x = 0
          for (const segment of segments) {
            parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
            x += shelfBeamLength / segments.length + PART_GAP / 2
          }
          looseY += BEAM_WIDTH + PART_GAP / 2
        }
      }
      for (let index = 0; index < shelfCount * 4; index++)
        parts.push(solid(cornerBlock(6).translate([(index % 12) * (18 + PART_GAP), looseY + Math.floor(index / 12) * 24, 0])))
      looseY += Math.ceil((shelfCount * 4) / 12) * 24 + PART_GAP
      let frameBraceJoins = 0
      const perimeterLengths = [shelfWidth + POST_SIZE * 2, shelfWidth + POST_SIZE * 2, shelfDepth, shelfDepth]
      for (let frame = 0; frame < 2; frame++) {
        for (const length of perimeterLengths) {
          const brace = splitBar(length)
          frameBraceJoins += Math.max(0, brace.length - 1)
          let x = 0
          for (const segment of brace) {
            parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
            x += length / brace.length + PART_GAP / 2
          }
          looseY += BEAM_WIDTH + PART_GAP / 2
        }
      }
      for (let index = 0; index < 8; index++) parts.push(solid(cornerBlock(10).translate([index * 26, looseY, 0])))
      looseY += 18 + PART_GAP
      const tileColumnGroups = Math.ceil(columns / Math.max(1, Math.round(config.tileColumns)))
      const tileRowGroups = Math.ceil(rows / Math.max(1, Math.round(config.tileRows)))
      const tileJoins = (tileColumnGroups - 1) * tileRowGroups + (tileRowGroups - 1) * tileColumnGroups
      const joinsPerShelf = tileJoins + Math.max(0, segments.length - 1) * 2
      const joiningKeyCount = joinsPerShelf * shelfCount + frameBraceJoins
      for (let index = 0; index < joiningKeyCount; index++)
        parts.push(
          solid(key().translate([(index % 16) * (KEY_LENGTH + 3), looseY + Math.floor(index / 16) * (KEY_WIDTH + 3), KEY_THICKNESS / 2])),
        )
      looseY += Math.ceil(joiningKeyCount / 16) * (KEY_WIDTH + 3) + PART_GAP
      if (config.handle) parts.push(solid(handlePrint().translate([60, looseY + 20, 0])))
    }

    const kit = solid(Manifold.union(parts))
    const volume = kit.volume()
    const triangles = kit.numTri()
    return { mesh: kit.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
