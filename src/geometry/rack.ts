import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from 'manifold-3d'
import type { BaseStats, RackConfig } from './types'

const GRID = 42
const GAP = 0.5
const CORNER_RADIUS = 3.75
const RECEIVER_DEPTH = 2.8
const RECEIVER_INSET = 2.15
const FRAME_THICKNESS = 5
const UPRIGHT_WIDTH = 8
const RAIL_HEIGHT = 2.4
const BEAM_WIDTH = 8
const BEAM_HEIGHT = 5
const TONGUE_REACH = 3.5
const TONGUE_THICKNESS = 3
const SHELF_SKIN = 1.2
const SHELF_RIB = 4
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
    slotPitch: 14,
    shelfCount: 4,
    shelfThickness: 7,
    tileColumns: 2,
    tileRows: 2,
    baseplateThickness: 5,
    fitClearance: 0.3,
    retainer: true,
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

export function rackSlotLevels(config: RackConfig): number[] {
  const pitch = config.slotPitch === 7 ? 7 : 14
  return Array.from({ length: Math.max(0, Math.floor((config.height - pitch * 2) / pitch) + 1) }, (_, index) => pitch + index * pitch)
}

export function rackDimensions(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  if (config.view === 'assembled') return { width: width + FRAME_THICKNESS * 2, length, height: config.height }
  const tiles = rackTiles(config)
  const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID - GAP))
  const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID - GAP))
  const partsAcross = Math.ceil(Math.sqrt(tiles.length * config.shelfCount))
  const partRows = Math.ceil((tiles.length * config.shelfCount) / partsAcross)
  const tileAreaWidth = partsAcross * (widestTile + PART_GAP)
  const tileAreaLength = partRows * (deepestTile + PART_GAP)
  return {
    width: Math.max(tileAreaWidth, length * 2 + PART_GAP, width + UPRIGHT_WIDTH * 2),
    length: tileAreaLength + config.height * 2 + PART_GAP * 4,
    height: Math.max(config.shelfThickness, FRAME_THICKNESS),
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
    const levels = rackSlotLevels(config)
    if (config.height < 70 || levels.length < 3) throw new Error('Rack height must provide at least three shelf positions')
    if (![7, 14].includes(config.slotPitch)) throw new Error('Shelf slot pitch must be 7 or 14 mm')
    if (config.shelfThickness < 5) throw new Error('Rack shelves must be at least 5 mm thick')
    if (config.baseplateThickness < 3) throw new Error('Existing baseplate thickness must be at least 3 mm')

    const tileSolid = (tile: TileSpec) => {
      const width = tile.columns * GRID - GAP
      const depth = tile.rows * GRID - GAP
      const outline = rounded(width, depth, Math.min(CORNER_RADIUS, width / 2 - 0.01, depth / 2 - 0.01))
      const deck = solid(outline.extrude(config.shelfThickness))
      const receiverCutters: Manifold[] = []
      const undersideCutters: Manifold[] = []
      const undersideDepth = config.shelfThickness - RECEIVER_DEPTH - SHELF_SKIN
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
          if (undersideDepth > 0) {
            const cavity = rounded(GRID - SHELF_RIB, GRID - SHELF_RIB, 2)
            const cavityCut = solid(cavity.extrude(undersideDepth + 0.01))
            undersideCutters.push(solid(cavityCut.translate([x, y, -0.005])))
          }
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
      return solid(Manifold.difference([deck, ...receiverCutters, ...undersideCutters, ...keyways]))
    }

    const framePrint = () => {
      const frontSpine = FRAME_THICKNESS - TONGUE_REACH - config.fitClearance
      const parts: Manifold[] = [
        cube([UPRIGHT_WIDTH, config.height, frontSpine], [-(shelfDepth - UPRIGHT_WIDTH) / 2, 0, -(FRAME_THICKNESS - frontSpine) / 2]),
        cube([UPRIGHT_WIDTH, config.height, FRAME_THICKNESS], [(shelfDepth - UPRIGHT_WIDTH) / 2, 0, 0]),
      ]
      for (const height of levels) {
        const lower = -config.height / 2 + height
        const upper = lower + RAIL_HEIGHT + TONGUE_THICKNESS + config.fitClearance
        parts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, lower, 0]))
        parts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, upper, 0]))
      }
      parts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, -config.height / 2 + RAIL_HEIGHT / 2, 0]))
      return solid(Manifold.union(parts))
    }

    const beamSegments = () => {
      const count = Math.ceil(shelfWidth / (GRID * 2))
      const segmentLength = shelfWidth / count
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
        if (index < count - 1)
          cutters.push(
            cube(
              [KEY_LENGTH / 2 + config.fitClearance, KEY_WIDTH + config.fitClearance, keyDepth],
              [length / 2 - KEY_LENGTH / 4, 0, -BEAM_HEIGHT / 2 + keyDepth / 2 - 0.005],
            ),
          )
        return cutters.length === 0 ? beam : solid(Manifold.difference([beam, ...cutters]))
      })
    }

    const key = () => cube([KEY_LENGTH, KEY_WIDTH, KEY_THICKNESS])
    const clamp = () => {
      const outer = cube([16, 14, config.baseplateThickness + FRAME_THICKNESS + 4])
      const slot = cube([12, 14.02, config.baseplateThickness + config.fitClearance], [0, 0, FRAME_THICKNESS / 2])
      return solid(Manifold.difference([outer, slot]))
    }

    const retainerPrint = () => {
      const legWidth = UPRIGHT_WIDTH / 2
      const rackOuter = shelfWidth + FRAME_THICKNESS * 2
      const retainerWidth = rackOuter + legWidth * 2 + config.fitClearance * 2
      const legX = (rackOuter + legWidth + config.fitClearance * 2) / 2
      return solid(
        Manifold.union([
          cube([retainerWidth, legWidth, FRAME_THICKNESS]),
          cube([legWidth, config.height, FRAME_THICKNESS], [-legX, -config.height / 2, 0]),
          cube([legWidth, config.height, FRAME_THICKNESS], [legX, -config.height / 2, 0]),
          cube([3, config.height, FRAME_THICKNESS], [-(shelfWidth / 2 + TONGUE_REACH - 1.5), -config.height / 2, 0]),
          cube([3, config.height, FRAME_THICKNESS], [shelfWidth / 2 + TONGUE_REACH - 1.5, -config.height / 2, 0]),
        ]),
      )
    }

    const parts: Manifold[] = []
    const tiles = rackTiles(config)
    if (config.view === 'assembled') {
      // A thin proxy shows the user's existing baseplate; exports always force print view and omit it.
      parts.push(cube([shelfWidth, shelfDepth, config.baseplateThickness], [0, 0, config.baseplateThickness / 2]))
      const frameSide = (x: number) => {
        const members: Manifold[] = [
          cube([FRAME_THICKNESS, UPRIGHT_WIDTH, config.height], [x, -shelfDepth / 2 + UPRIGHT_WIDTH / 2, config.height / 2]),
          cube([FRAME_THICKNESS, UPRIGHT_WIDTH, config.height], [x, shelfDepth / 2 - UPRIGHT_WIDTH / 2, config.height / 2]),
        ]
        for (const level of levels) {
          members.push(cube([FRAME_THICKNESS, shelfDepth, RAIL_HEIGHT], [x, 0, level]))
          members.push(
            cube([FRAME_THICKNESS, shelfDepth, RAIL_HEIGHT], [x, 0, level + RAIL_HEIGHT + TONGUE_THICKNESS + config.fitClearance]),
          )
        }
        parts.push(solid(Manifold.union(members)))
      }
      frameSide(-(shelfWidth + FRAME_THICKNESS) / 2)
      frameSide((shelfWidth + FRAME_THICKNESS) / 2)
      const shownLevels = Array.from(
        { length: shelfCount },
        (_, index) => levels[Math.round((index * (levels.length - 1)) / Math.max(1, shelfCount - 1))],
      )
      for (const level of shownLevels) {
        for (const y of [-shelfDepth / 2 + GRID / 2, shelfDepth / 2 - GRID / 2])
          parts.push(cube([shelfWidth + TONGUE_REACH * 2, BEAM_WIDTH, BEAM_HEIGHT], [0, y, level + BEAM_HEIGHT / 2]))
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID - GAP) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID - GAP) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, level + BEAM_HEIGHT])))
        }
      }
      for (const x of [-shelfWidth / 2 - 5, shelfWidth / 2 + 5])
        for (const y of [-shelfDepth / 2 + 12, shelfDepth / 2 - 12]) parts.push(solid(clamp().translate([x, y, 8])))
      if (config.retainer) {
        const frontY = -shelfDepth / 2 - FRAME_THICKNESS
        const retainerWidth = shelfWidth + FRAME_THICKNESS * 2 + UPRIGHT_WIDTH
        parts.push(cube([retainerWidth, FRAME_THICKNESS, UPRIGHT_WIDTH / 2], [0, frontY, config.height - UPRIGHT_WIDTH / 4]))
        parts.push(
          cube([UPRIGHT_WIDTH / 2, FRAME_THICKNESS, config.height], [-retainerWidth / 2 + UPRIGHT_WIDTH / 4, frontY, config.height / 2]),
        )
        parts.push(
          cube([UPRIGHT_WIDTH / 2, FRAME_THICKNESS, config.height], [retainerWidth / 2 - UPRIGHT_WIDTH / 4, frontY, config.height / 2]),
        )
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
      const frame = framePrint()
      const frameY = rowsOfTiles * (deepestTile + PART_GAP) + config.height / 2
      parts.push(solid(frame.translate([0, frameY, FRAME_THICKNESS / 2])))
      parts.push(solid(frame.translate([shelfDepth + PART_GAP, frameY, FRAME_THICKNESS / 2])))
      const segments = beamSegments()
      let looseY = frameY + config.height / 2 + PART_GAP + BEAM_WIDTH / 2
      for (let shelf = 0; shelf < shelfCount; shelf++) {
        for (let beam = 0; beam < 2; beam++) {
          let x = 0
          for (const segment of segments) {
            parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
            x += shelfWidth / segments.length + PART_GAP / 2
          }
          looseY += BEAM_WIDTH + PART_GAP / 2
        }
      }
      const tileColumnGroups = Math.ceil(columns / Math.max(1, Math.round(config.tileColumns)))
      const tileRowGroups = Math.ceil(rows / Math.max(1, Math.round(config.tileRows)))
      const tileJoins = (tileColumnGroups - 1) * tileRowGroups + (tileRowGroups - 1) * tileColumnGroups
      const joinsPerShelf = tileJoins + Math.max(0, segments.length - 1) * 2
      for (let index = 0; index < joinsPerShelf * shelfCount; index++)
        parts.push(
          solid(key().translate([(index % 16) * (KEY_LENGTH + 3), looseY + Math.floor(index / 16) * (KEY_WIDTH + 3), KEY_THICKNESS / 2])),
        )
      looseY += Math.ceil((joinsPerShelf * shelfCount) / 16) * (KEY_WIDTH + 3) + PART_GAP
      for (let index = 0; index < 4; index++)
        parts.push(solid(clamp().translate([index * 20, looseY, (config.baseplateThickness + FRAME_THICKNESS + 4) / 2])))
      if (config.retainer)
        parts.push(solid(retainerPrint().translate([shelfWidth / 2, looseY + config.height + PART_GAP, FRAME_THICKNESS / 2])))
    }

    const kit = solid(Manifold.union(parts))
    const volume = kit.volume()
    const triangles = kit.numTri()
    return { mesh: kit.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
