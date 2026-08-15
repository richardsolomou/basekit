import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from 'manifold-3d'
import {
  GRIDFINITY_CORNER_RADIUS as CORNER_RADIUS,
  GRIDFINITY_FOOT_HEIGHT,
  GRIDFINITY_FOOT_PROFILE,
  GRIDFINITY_FOOT_SIZE,
  GRIDFINITY_PITCH as GRID,
} from './gridfinity'
import type { BaseStats, RackConfig } from './types'

const ROD_DIAMETER = 6
const ANGLE_LEG = 20
const ANGLE_THICKNESS = 2
const ALUMINUM_MODULUS = 69_000
const ALUMINUM_YIELD = 145
const TRANSPORT_SHOCK_G = 3
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
    shelfThickness: 6,
    tileColumns: 2,
    tileRows: 2,
    gridfinityClearance: 0.15,
    fitClearance: 0.3,
    designLoadKg: 2,
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
  return { width: Math.round(config.columns) * GRID, length: Math.round(config.rows) * GRID }
}

export function rackShelfLevels(config: RackConfig): number[] {
  const margin = 14
  const highestRail = config.height - ANGLE_LEG - config.shelfThickness
  return Array.from(
    { length: config.shelfCount },
    (_, index) => margin + (index * (highestRail - margin)) / Math.max(1, config.shelfCount - 1),
  )
}

/** The cavity is the canonical holder foot read from its top down, plus diametric fit clearance. */
export function rackReceiverProfile(config: RackConfig) {
  return GRIDFINITY_FOOT_PROFILE.toReversed().map(({ inset, z }) => ({
    depth: GRIDFINITY_FOOT_HEIGHT - z,
    size: GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - inset * 2,
  }))
}

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

export function rackStructuralAnalysis(config: RackConfig) {
  const span = rackShelfDimensions(config).width + ANGLE_LEG * 2
  const designForce = config.designLoadKg * 9.81 * TRANSPORT_SHOCK_G
  // Conservatively assign half the complete shelf shock load to one crossrail.
  const beamForce = designForce / 2
  const inertia = (ANGLE_THICKNESS * ANGLE_LEG ** 3) / 12
  const moment = (beamForce * span) / 4
  const stress = (moment * (ANGLE_LEG / 2)) / inertia
  const deflection = (beamForce * span ** 3) / (48 * ALUMINUM_MODULUS * inertia)
  const safetyFactor = ALUMINUM_YIELD / stress
  return { span, designForce, stress, deflection, safetyFactor, passes: safetyFactor >= 2 && deflection <= 1 }
}

export function rackHardware(config: RackConfig) {
  const shelfCorners = config.shelfCount * 4
  const { width, length } = rackShelfDimensions(config)
  const crossrails = rackBeamPositions(config).length
  const widthRailCount = config.shelfCount * crossrails + 4 + (config.handle ? 1 : 0)
  const depthRailCount = config.shelfCount * 2 + 4
  const m4Connections = config.shelfCount * crossrails * 2 + (config.handle ? 4 : 0)
  return {
    m6Rods: 4,
    m6RodLength: config.height,
    m6Nuts: shelfCorners * 2 + 16,
    m6Washers: shelfCorners * 2 + 16,
    m4Bolts: m4Connections,
    m4Nuts: m4Connections,
    angleSize: `${ANGLE_LEG}×${ANGLE_LEG}×${ANGLE_THICKNESS}mm`,
    widthRails: { count: widthRailCount, length: width + ANGLE_LEG * 2 },
    depthRails: { count: depthRailCount, length: length + ANGLE_LEG * 2 },
  }
}

export function rackDimensions(config: RackConfig) {
  const { width, length } = rackShelfDimensions(config)
  if (config.view === 'assembled')
    return { width: width + ANGLE_LEG * 2, length: length + ANGLE_LEG * 2, height: config.height + (config.handle ? 38 : 0) }
  const tiles = rackTiles(config)
  const widestTile = Math.max(...tiles.map((tile) => tile.columns * GRID))
  const deepestTile = Math.max(...tiles.map((tile) => tile.rows * GRID))
  const partsAcross = Math.ceil(Math.sqrt(tiles.length * config.shelfCount))
  const partRows = Math.ceil((tiles.length * config.shelfCount) / partsAcross)
  const tileAreaWidth = partsAcross * (widestTile + PART_GAP)
  const tileAreaLength = partRows * (deepestTile + PART_GAP)
  return {
    width: Math.max(tileAreaWidth, KEY_LENGTH * 16),
    length: tileAreaLength + KEY_WIDTH + PART_GAP,
    height: config.shelfThickness,
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
  const angleX = (length: number, offset: [number, number, number]) =>
    solid(
      Manifold.union([
        cube([length, ANGLE_LEG, ANGLE_THICKNESS], [offset[0], offset[1], offset[2] + ANGLE_THICKNESS / 2]),
        cube([length, ANGLE_THICKNESS, ANGLE_LEG], [offset[0], offset[1], offset[2] + ANGLE_LEG / 2]),
      ]),
    )
  const angleY = (length: number, offset: [number, number, number]) =>
    solid(
      Manifold.union([
        cube([ANGLE_LEG, length, ANGLE_THICKNESS], [offset[0], offset[1], offset[2] + ANGLE_THICKNESS / 2]),
        cube([ANGLE_THICKNESS, length, ANGLE_LEG], [offset[0], offset[1], offset[2] + ANGLE_LEG / 2]),
      ]),
    )
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
    const levels = rackShelfLevels(config)
    if (config.height < 70) throw new Error('Rack height must be at least 70 mm')
    if (config.shelfThickness < GRIDFINITY_FOOT_HEIGHT + 0.8)
      throw new Error('Rack shelves must leave at least 0.8 mm below the Gridfinity foot profile')
    if (config.gridfinityClearance < 0.05 || config.gridfinityClearance > 0.25)
      throw new Error('Gridfinity fit clearance must be between 0.05 and 0.25 mm')
    if (!rackStructuralAnalysis(config).passes)
      throw new Error('The selected shelf load exceeds the conservative aluminum-angle design limit')

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
            const fromOutline = rounded(
              GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - from.inset * 2,
              GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - from.inset * 2,
              Math.max(0.01, CORNER_RADIUS - from.inset),
            )
            const toOutline = rounded(
              GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - to.inset * 2,
              GRIDFINITY_FOOT_SIZE + config.gridfinityClearance - to.inset * 2,
              Math.max(0.01, CORNER_RADIUS - to.inset),
            )
            const fromZ = config.shelfThickness - (GRIDFINITY_FOOT_HEIGHT - from.z) + (index === 0 ? 0.01 : 0)
            const toZ = config.shelfThickness - (GRIDFINITY_FOOT_HEIGHT - to.z)
            socketSegments.push(solid(Manifold.hull([...pointsAt(fromOutline, fromZ), ...pointsAt(toOutline, toZ)])))
          }
          const socket = solid(Manifold.union(socketSegments))
          receiverCutters.push(solid(socket.translate([x, y, 0])))
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

    const key = () => cube([KEY_LENGTH, KEY_WIDTH, KEY_THICKNESS])

    const parts: Manifold[] = []
    const tiles = rackTiles(config)
    if (config.view === 'assembled') {
      const postX = (shelfWidth + ANGLE_LEG) / 2
      const postY = (shelfDepth + ANGLE_LEG) / 2
      const rodOutline = section(CrossSection.circle(ROD_DIAMETER / 2, 32))
      for (const x of [-postX, postX]) {
        for (const y of [-postY, postY]) {
          const rod = solid(rodOutline.extrude(config.height))
          parts.push(solid(rod.translate([x, y, 0])))
        }
      }
      for (const z of [0, config.height - ANGLE_LEG]) {
        parts.push(angleX(shelfWidth + ANGLE_LEG * 2, [0, -postY, z]))
        parts.push(angleX(shelfWidth + ANGLE_LEG * 2, [0, postY, z]))
        parts.push(angleY(shelfDepth + ANGLE_LEG * 2, [-postX, 0, z]))
        parts.push(angleY(shelfDepth + ANGLE_LEG * 2, [postX, 0, z]))
      }
      if (config.handle) parts.push(angleX(shelfWidth + ANGLE_LEG * 2, [0, 0, config.height - ANGLE_LEG]))
      for (const level of levels) {
        for (const x of [-postX, postX]) parts.push(angleY(shelfDepth + ANGLE_LEG * 2, [x, 0, level]))
        for (const y of rackBeamPositions(config)) parts.push(angleX(shelfWidth + ANGLE_LEG * 2, [0, y, level]))
        for (const tile of tiles) {
          const x = -shelfWidth / 2 + tile.column * GRID + (tile.columns * GRID) / 2
          const y = -shelfDepth / 2 + tile.row * GRID + (tile.rows * GRID) / 2
          parts.push(solid(tileSolid(tile).translate([x, y, level + ANGLE_LEG])))
        }
      }
      if (config.handle) {
        parts.push(cube([100, 8, 8], [0, 0, config.height + 34]))
        parts.push(cube([8, 8, 40], [-46, 0, config.height + 15]))
        parts.push(cube([8, 8, 40], [46, 0, config.height + 15]))
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
      const tileColumnGroups = Math.ceil(columns / Math.max(1, Math.round(config.tileColumns)))
      const tileRowGroups = Math.ceil(rows / Math.max(1, Math.round(config.tileRows)))
      const tileJoins = (tileColumnGroups - 1) * tileRowGroups + (tileRowGroups - 1) * tileColumnGroups
      const joiningKeyCount = tileJoins * shelfCount
      const looseY = rowsOfTiles * (deepestTile + PART_GAP) + KEY_WIDTH / 2
      for (let index = 0; index < joiningKeyCount; index++)
        parts.push(
          solid(key().translate([(index % 16) * (KEY_LENGTH + 3), looseY + Math.floor(index / 16) * (KEY_WIDTH + 3), KEY_THICKNESS / 2])),
        )
    }

    const kit = solid(Manifold.union(parts))
    const volume = kit.volume()
    const triangles = kit.numTri()
    return { mesh: kit.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
