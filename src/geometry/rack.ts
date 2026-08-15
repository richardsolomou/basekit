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
const BEAM_WIDTH = 12
const BEAM_HEIGHT = 32
const BEAM_FLANGE = 3
const BEAM_WEB = 2.4
const UPRIGHT_WALL = 3
const BEAM_KEY_LENGTH = 32
const BEAM_KEY_WIDTH = 12
const BEAM_KEY_THICKNESS = 6
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
    shelfCount: 3,
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
  return { width: Math.round(config.columns) * GRID, length: Math.round(config.rows) * GRID }
}

export const rackShelfLevels = rackSlotLevels

export function rackBeamPositions(config: RackConfig): number[] {
  const rowChunks = chunks(Math.max(1, Math.round(config.rows)), Math.max(1, Math.round(config.tileRows)))
  const length = Math.round(config.rows) * GRID
  const positions = [-length / 2]
  let rows = 0
  for (const chunk of rowChunks) {
    rows += chunk
    positions.push(-length / 2 + rows * GRID)
  }
  return positions
}

export function rackReceiverProfile(config: RackConfig) {
  return GRIDFINITY_FOOT_PROFILE.toReversed().map(({ inset, z }) => ({
    depth: GRIDFINITY_FOOT_HEIGHT - z,
    size: GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
  }))
}

export function rackHardware(config: RackConfig) {
  const uprightSegments = 4
  const shelfFrames = config.shelfCount
  const crossrails = rackBeamPositions(config).length * shelfFrames
  const sideRails = shelfFrames * 2
  return {
    printedUprights: uprightSegments,
    printedShelfRails: crossrails + sideRails,
    printedLockPins: shelfFrames * 4,
    purchasedParts: 0,
  }
}

export function rackStructuralAnalysis(config: RackConfig) {
  const span = rackShelfDimensions(config).width + POST_SIZE
  const force = (config.designLoadKg * 9.81 * 3) / rackBeamPositions(config).length
  // Side-printed I-sections put most material at the faces where it resists
  // bending. Treat every removable splice as retaining half that stiffness.
  const webHeight = BEAM_HEIGHT - BEAM_FLANGE * 2
  const flangeInertia = 2 * ((BEAM_WIDTH * BEAM_FLANGE ** 3) / 12 + BEAM_WIDTH * BEAM_FLANGE * ((BEAM_HEIGHT - BEAM_FLANGE) / 2) ** 2)
  const webInertia = (BEAM_WEB * webHeight ** 3) / 12
  const inertia = (flangeInertia + webInertia) * 0.5
  const stress = (((force * span) / 4) * (BEAM_HEIGHT / 2)) / inertia
  const deflection = (force * span ** 3) / (48 * 2_000 * inertia)
  const safetyFactor = 8 / stress
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
    height: Math.max(config.shelfThickness, FRAME_THICKNESS, POST_SIZE, BEAM_HEIGHT),
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
    const shelfWidth = columns * GRID
    const shelfDepth = rows * GRID
    const levels = rackSlotLevels(config)
    if (config.height < 70 || levels.length < 3) throw new Error('Rack height must provide at least three shelf positions')
    if (![7, 14].includes(config.slotPitch)) throw new Error('Shelf slot pitch must be 7 or 14 mm')
    if (config.shelfThickness < GRIDFINITY_FOOT_HEIGHT + 0.8)
      throw new Error('Rack shelves must leave at least 0.8 mm below the Gridfinity foot profile')
    if (!rackStructuralAnalysis(config).passes) throw new Error('The selected shelf load exceeds the printed-frame design screen')

    const tileSolid = (tile: TileSpec) => {
      const width = tile.columns * GRID
      const depth = tile.rows * GRID
      const outline = rounded(width, depth, Math.min(CORNER_RADIUS, width / 2 - 0.01, depth / 2 - 0.01))
      const deck = solid(outline.extrude(config.shelfThickness))
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
          const opening = rounded(30, 30, 2)
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

    const beamSolid = (length: number) => {
      const top = cube([length, BEAM_WIDTH, BEAM_FLANGE], [0, 0, (BEAM_HEIGHT - BEAM_FLANGE) / 2])
      const bottom = cube([length, BEAM_WIDTH, BEAM_FLANGE], [0, 0, -(BEAM_HEIGHT - BEAM_FLANGE) / 2])
      const web = cube([length, BEAM_WEB, BEAM_HEIGHT - BEAM_FLANGE * 2])
      return solid(Manifold.union([top, bottom, web]))
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

    const splitBar = (barLength: number) => {
      const count = Math.ceil(barLength / (GRID * 2))
      const segmentLength = barLength / count
      return Array.from({ length: count }, (_, index) => {
        const length = segmentLength - config.fitClearance
        const beam = beamSolid(length)
        const keyDepth = BEAM_KEY_THICKNESS + config.fitClearance
        const cutters: Manifold[] = []
        if (index > 0)
          cutters.push(
            cube(
              [BEAM_KEY_LENGTH / 2 + config.fitClearance, BEAM_KEY_WIDTH + config.fitClearance, keyDepth],
              [-length / 2 + BEAM_KEY_LENGTH / 4, 0, -BEAM_HEIGHT / 2 + keyDepth / 2 - 0.005],
            ),
          )
        if (index < count - 1)
          cutters.push(
            cube(
              [BEAM_KEY_LENGTH / 2 + config.fitClearance, BEAM_KEY_WIDTH + config.fitClearance, keyDepth],
              [length / 2 - BEAM_KEY_LENGTH / 4, 0, -BEAM_HEIGHT / 2 + keyDepth / 2 - 0.005],
            ),
          )
        return cutters.length === 0 ? beam : solid(Manifold.difference([beam, ...cutters]))
      })
    }

    const key = () => cube([KEY_LENGTH, KEY_WIDTH, KEY_THICKNESS])
    const beamKey = () => cube([BEAM_KEY_LENGTH, BEAM_KEY_WIDTH, BEAM_KEY_THICKNESS])
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
        for (const y of [-postY, postY]) parts.push(solid(uprightAssembled().translate([x, y, config.height / 2])))
      parts.push(solid(beamSolid(shelfWidth + POST_SIZE * 2).translate([0, -postY, config.height - BEAM_HEIGHT / 2])))
      parts.push(solid(beamSolid(shelfWidth + POST_SIZE * 2).translate([0, postY, config.height - BEAM_HEIGHT / 2])))
      parts.push(
        solid(
          beamSolid(shelfDepth)
            .rotate([0, 0, 90])
            .translate([-postX, 0, config.height - BEAM_HEIGHT / 2]),
        ),
      )
      parts.push(
        solid(
          beamSolid(shelfDepth)
            .rotate([0, 0, 90])
            .translate([postX, 0, config.height - BEAM_HEIGHT / 2]),
        ),
      )
      const shownLevels = Array.from(
        { length: shelfCount },
        (_, index) => levels[Math.round((index * (levels.length - 1)) / Math.max(1, shelfCount - 1))],
      )
      for (const level of shownLevels) {
        for (const y of rackBeamPositions(config))
          parts.push(solid(beamSolid(shelfWidth + POST_SIZE).translate([0, y, level + BEAM_HEIGHT / 2])))
        for (const x of [-postX, postX])
          parts.push(
            solid(
              beamSolid(shelfDepth + POST_SIZE)
                .rotate([0, 0, 90])
                .translate([x, 0, level + BEAM_HEIGHT / 2]),
            ),
          )
        for (const x of [-postX, postX])
          for (const y of [-postY, postY])
            parts.push(cube([LOCK_PIN_SIZE, POST_SIZE + 4, LOCK_PIN_SIZE], [x, y, level + LOCK_PIN_SIZE / 2]))
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, level + BEAM_HEIGHT])))
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
      const shelfBeamLength = shelfWidth + POST_SIZE
      const segments = splitBar(shelfBeamLength)
      let looseY = frameY + config.height / 2 + PART_GAP + BEAM_WIDTH / 2
      for (let shelf = 0; shelf < shelfCount; shelf++) {
        for (let beam = 0; beam < rackBeamPositions(config).length; beam++) {
          let x = 0
          for (const segment of segments) {
            parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
            x += shelfBeamLength / segments.length + PART_GAP / 2
          }
          looseY += BEAM_WIDTH + PART_GAP / 2
        }
        for (let side = 0; side < 2; side++) {
          const sideSegments = splitBar(shelfDepth + POST_SIZE)
          let x = 0
          for (const segment of sideSegments) {
            parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
            x += (shelfDepth + POST_SIZE) / sideSegments.length + PART_GAP / 2
          }
          looseY += BEAM_WIDTH + PART_GAP / 2
        }
      }
      let topBraceJoins = 0
      for (const length of [shelfWidth + POST_SIZE * 2, shelfWidth + POST_SIZE * 2, shelfDepth, shelfDepth]) {
        const brace = splitBar(length)
        topBraceJoins += Math.max(0, brace.length - 1)
        let x = 0
        for (const segment of brace) {
          parts.push(solid(segment.translate([x, looseY, BEAM_HEIGHT / 2])))
          x += length / brace.length + PART_GAP / 2
        }
        looseY += BEAM_WIDTH + PART_GAP / 2
      }
      const tileColumnGroups = Math.ceil(columns / Math.max(1, Math.round(config.tileColumns)))
      const tileRowGroups = Math.ceil(rows / Math.max(1, Math.round(config.tileRows)))
      const tileJoins = (tileColumnGroups - 1) * tileRowGroups + (tileRowGroups - 1) * tileColumnGroups
      const tileKeyCount = tileJoins * shelfCount
      const beamKeyCount =
        (Math.max(0, segments.length - 1) * rackBeamPositions(config).length +
          Math.max(0, splitBar(shelfDepth + POST_SIZE).length - 1) * 2) *
          shelfCount +
        topBraceJoins
      for (let index = 0; index < tileKeyCount; index++)
        parts.push(
          solid(key().translate([(index % 16) * (KEY_LENGTH + 3), looseY + Math.floor(index / 16) * (KEY_WIDTH + 3), KEY_THICKNESS / 2])),
        )
      looseY += Math.ceil(tileKeyCount / 16) * (KEY_WIDTH + 3) + PART_GAP
      for (let index = 0; index < beamKeyCount; index++)
        parts.push(
          solid(
            beamKey().translate([
              (index % 10) * (BEAM_KEY_LENGTH + 3),
              looseY + Math.floor(index / 10) * (BEAM_KEY_WIDTH + 3),
              BEAM_KEY_THICKNESS / 2,
            ]),
          ),
        )
      looseY += Math.ceil(beamKeyCount / 10) * (BEAM_KEY_WIDTH + 3) + PART_GAP
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
