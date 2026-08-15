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
const TONGUE_REACH = 3.5
const TONGUE_THICKNESS = 3
const SHELF_SKIN = 1.2
const SHELF_RIB = 4
const PART_GAP = 8
const PLA_DENSITY = 1.24e-3

export interface RackBuildResult {
  mesh: Mesh
  stats: BaseStats
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
    fitClearance: 0.3,
    retainer: true,
    segments: 160,
  }
}

export function rackName(config: RackConfig): string {
  return `gridfinity-rack-${Math.round(config.columns)}x${Math.round(config.rows)}-${Math.round(config.height)}mm-${Math.round(config.shelfCount)}-shelves`
}

export function rackDimensions(config: RackConfig) {
  const shelfWidth = Math.round(config.columns) * GRID - GAP
  const shelfDepth = Math.round(config.rows) * GRID - GAP
  const shelvesAcross = Math.max(1, Math.ceil(Math.sqrt(config.shelfCount)))
  const shelfRows = Math.ceil(config.shelfCount / shelvesAcross)
  const shelvesWidth = shelvesAcross * (shelfWidth + TONGUE_REACH * 2 + PART_GAP) - PART_GAP
  const shelvesDepth = shelfRows * (shelfDepth + PART_GAP) - PART_GAP
  const framesWidth = shelfDepth * 2 + PART_GAP
  const retainerWidth = shelfWidth + FRAME_THICKNESS * 2 + UPRIGHT_WIDTH + config.fitClearance * 2
  const kitWidth = Math.max(shelvesWidth, framesWidth, config.retainer ? retainerWidth : 0)
  const kitLength = shelvesDepth + PART_GAP + config.height + (config.retainer ? config.height + PART_GAP : 0)
  return { width: kitWidth, length: kitLength, height: Math.max(config.shelfThickness, FRAME_THICKNESS) }
}

export function rackShelfDimensions(config: RackConfig) {
  return { width: Math.round(config.columns) * GRID - GAP, length: Math.round(config.rows) * GRID - GAP }
}

export function rackSlotLevels(config: RackConfig): number[] {
  const pitch = config.slotPitch === 7 ? 7 : 14
  const bottom = pitch
  const top = config.height - pitch
  return Array.from({ length: Math.max(0, Math.floor((top - bottom) / pitch) + 1) }, (_, index) => bottom + index * pitch)
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

  try {
    const columns = Math.max(1, Math.round(config.columns))
    const rows = Math.max(1, Math.round(config.rows))
    const shelfCount = Math.max(3, Math.round(config.shelfCount))
    if (config.height < 70) throw new Error('Rack height must be at least 70 mm')
    if (![7, 14].includes(config.slotPitch)) throw new Error('Shelf slot pitch must be 7 or 14 mm')
    if (config.shelfThickness < 5) throw new Error('Rack shelves must be at least 5 mm thick')
    const levels = rackSlotLevels(config)
    if (levels.length < 3) throw new Error('Rack height must provide at least three shelf positions')

    const shelfWidth = columns * GRID - GAP
    const shelfDepth = rows * GRID - GAP
    const radius = Math.min(CORNER_RADIUS, shelfWidth / 2 - 0.01, shelfDepth / 2 - 0.01)
    const rounded = (width: number, depth: number, cornerRadius: number) => {
      const core = section(CrossSection.square([width - cornerRadius * 2, depth - cornerRadius * 2], true))
      return section(core.offset(cornerRadius, 'Round', 2, 32))
    }

    const deckOutline = rounded(shelfWidth, shelfDepth, radius)
    const deck = solid(deckOutline.extrude(config.shelfThickness))
    const tongue = cube([shelfWidth + TONGUE_REACH * 2, shelfDepth - UPRIGHT_WIDTH * 2, TONGUE_THICKNESS])
    let shelf = solid(Manifold.union([deck, solid(tongue.translate([0, 0, TONGUE_THICKNESS / 2]))]))
    const receiverCutters: Manifold[] = []
    const undersideCutters: Manifold[] = []
    const undersideDepth = config.shelfThickness - RECEIVER_DEPTH - SHELF_SKIN
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = (column - (columns - 1) / 2) * GRID
        const y = (row - (rows - 1) / 2) * GRID
        const cell = rounded(GRID - GAP + 0.7 - RECEIVER_INSET * 2, GRID - GAP + 0.7 - RECEIVER_INSET * 2, CORNER_RADIUS - RECEIVER_INSET)
        const cut = solid(cell.extrude(RECEIVER_DEPTH + 0.01))
        receiverCutters.push(solid(cut.translate([x, y, config.shelfThickness - RECEIVER_DEPTH])))
        if (undersideDepth > 0) {
          const cavity = rounded(GRID - SHELF_RIB, GRID - SHELF_RIB, 2)
          const cavityCut = solid(cavity.extrude(undersideDepth + 0.01))
          undersideCutters.push(solid(cavityCut.translate([x, y, -0.005])))
        }
      }
    }
    shelf = solid(Manifold.difference([shelf, ...receiverCutters, ...undersideCutters]))

    const parts: Manifold[] = []
    const shelvesAcross = Math.max(1, Math.ceil(Math.sqrt(shelfCount)))
    const shelfStrideX = shelfWidth + TONGUE_REACH * 2 + PART_GAP
    const shelfStrideY = shelfDepth + PART_GAP
    const shelfRows = Math.ceil(shelfCount / shelvesAcross)
    for (let index = 0; index < shelfCount; index++) {
      const column = index % shelvesAcross
      const row = Math.floor(index / shelvesAcross)
      parts.push(solid(shelf.translate([(column - (shelvesAcross - 1) / 2) * shelfStrideX, row * shelfStrideY, 0])))
    }

    // The rear upright is a full stop. The front upright occupies only the
    // outside of the channel, leaving its inside face open for shelf insertion.
    const frontSpine = FRAME_THICKNESS - TONGUE_REACH - config.fitClearance
    const frameParts: Manifold[] = [
      cube([UPRIGHT_WIDTH, config.height, frontSpine], [-(shelfDepth - UPRIGHT_WIDTH) / 2, 0, -(FRAME_THICKNESS - frontSpine) / 2]),
      cube([UPRIGHT_WIDTH, config.height, FRAME_THICKNESS], [(shelfDepth - UPRIGHT_WIDTH) / 2, 0, 0]),
    ]
    for (const height of levels) {
      const lower = -config.height / 2 + height
      const upper = lower + RAIL_HEIGHT + TONGUE_THICKNESS + config.fitClearance
      frameParts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, lower, 0]))
      frameParts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, upper, 0]))
    }
    frameParts.push(cube([shelfDepth, RAIL_HEIGHT, FRAME_THICKNESS], [0, -config.height / 2 + RAIL_HEIGHT / 2, 0]))
    const frame = solid(Manifold.union(frameParts))
    const frameY = shelfRows * shelfStrideY + config.height / 2
    parts.push(solid(frame.translate([-shelfDepth / 2 - PART_GAP / 2, frameY, FRAME_THICKNESS / 2])))
    parts.push(solid(frame.translate([shelfDepth / 2 + PART_GAP / 2, frameY, FRAME_THICKNESS / 2])))

    if (config.retainer) {
      const legWidth = UPRIGHT_WIDTH / 2
      const rackOuterWidth = shelfWidth + FRAME_THICKNESS * 2
      const retainerWidth = rackOuterWidth + legWidth * 2 + config.fitClearance * 2
      const legX = (rackOuterWidth + legWidth + config.fitClearance * 2) / 2
      const bar = cube([retainerWidth, legWidth, FRAME_THICKNESS])
      const legs = [
        cube([legWidth, config.height, FRAME_THICKNESS], [-legX, -config.height / 2, 0]),
        cube([legWidth, config.height, FRAME_THICKNESS], [legX, -config.height / 2, 0]),
        cube([3, config.height, FRAME_THICKNESS], [-(shelfWidth / 2 + TONGUE_REACH - 1.5), -config.height / 2, 0]),
        cube([3, config.height, FRAME_THICKNESS], [shelfWidth / 2 + TONGUE_REACH - 1.5, -config.height / 2, 0]),
        cube([legWidth + 3, legWidth, FRAME_THICKNESS], [-legX + 1.5, -config.height + legWidth / 2, 0]),
        cube([legWidth + 3, legWidth, FRAME_THICKNESS], [legX - 1.5, -config.height + legWidth / 2, 0]),
      ]
      const retainer = solid(Manifold.union([bar, ...legs]))
      parts.push(solid(retainer.translate([0, frameY + config.height / 2 + PART_GAP + config.height, FRAME_THICKNESS / 2])))
    }

    const kit = solid(Manifold.union(parts))
    const volume = kit.volume()
    const triangles = kit.numTri()
    return { mesh: kit.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
