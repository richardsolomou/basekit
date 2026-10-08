import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { defaultHolderConfig, holderGroup, holderSlotMagnetCenters, slotOutline, type HolderBuildResult } from './holder'
import { trimNumber } from './outline'
import { curveTolerance, segmentsForTolerance } from './quality'
import type { MovementTrayConfig, MovementTrayShape } from './types'

const PLA_DENSITY = 1.24e-3
const MIN_FLOOR_THICKNESS = 0.6
export const MIN_MOVEMENT_TRAY_RIM = 1.2
/** Three nozzle widths, so neighbouring round slots never meet at a tangent point. */
const ROUND_SLOT_WEB = 1.2

export interface MovementTrayLayout {
  width: number
  length: number
  recessWidth: number
  recessLength: number
  slotCenters: { x: number; y: number }[]
}

/** Rectangular bases share one recess so a rank keeps base contact; round bases each get a slot. */
export function movementTrayLayout(config: MovementTrayConfig): MovementTrayLayout {
  const columns = Math.max(1, Math.round(config.columns))
  const ranks = Math.max(1, Math.round(config.ranks))
  const slotWidth = config.width + config.slotClearance
  const slotLength = (config.shape === 'round' ? config.width : config.length) + config.slotClearance
  const web = config.shape === 'round' ? ROUND_SLOT_WEB : 0
  const pitchX = slotWidth + web
  const pitchY = slotLength + web
  const recessWidth = columns * pitchX - web
  const recessLength = ranks * pitchY - web
  const slotCenters = Array.from({ length: ranks }, (_rank, rank) =>
    Array.from({ length: columns }, (_column, column) => ({
      x: (column - (columns - 1) / 2) * pitchX,
      y: (rank - (ranks - 1) / 2) * pitchY,
    })),
  ).flat()
  return {
    width: recessWidth + config.rim * 2,
    length: recessLength + config.rim * 2,
    recessWidth,
    recessLength,
    slotCenters,
  }
}

export const movementTrayHeight = (config: MovementTrayConfig): number => config.floorThickness + config.slotDepth

export function minimumMovementTrayFloor(config: {
  magnets: Pick<MovementTrayConfig['magnets'], 'enabled' | 'thickness' | 'depthClearance'>
}) {
  return (config.magnets.enabled ? config.magnets.thickness + config.magnets.depthClearance : 0) + MIN_FLOOR_THICKNESS
}

export function movementTrayMagnetPocketCount(config: MovementTrayConfig): number {
  if (!config.magnets.enabled) return 0
  return movementTrayLayout(config).slotCenters.length * holderSlotMagnetCenters(config, config).length
}

export function movementTrayBaseLabel(config: Pick<MovementTrayConfig, 'shape' | 'width' | 'length'>): string {
  return config.shape === 'round' ? `Ø${trimNumber(config.width)}` : `${trimNumber(config.width)}×${trimNumber(config.length)}`
}

export function movementTrayName(config: MovementTrayConfig): string {
  const size = config.shape === 'round' ? trimNumber(config.width) : `${trimNumber(config.width)}x${trimNumber(config.length)}`
  return `movement-tray-${Math.round(config.columns)}x${Math.round(config.ranks)}-${config.shape}-${size}mm`
}

export function movementTrayFootprint(shape: MovementTrayShape, width: number, length: number) {
  const group = holderGroup('movement-tray', 1, { shape, width, length })
  return { shape, width: group.width, length: group.length, cornerRadius: group.cornerRadius }
}

export function defaultMovementTrayConfig(): MovementTrayConfig {
  const holder = defaultHolderConfig()
  return {
    kind: 'movement-tray',
    ...movementTrayFootprint('rect', 25, 25),
    columns: 5,
    ranks: 4,
    slotClearance: 0.5,
    slotDepth: 2,
    floorThickness: 3,
    rim: 3,
    magnets: holder.magnets,
    magnetCounts: holder.magnetCounts,
    baseWallThickness: holder.baseWallThickness,
    magnetBossWall: holder.magnetBossWall,
    segments: 160,
  }
}

export function buildMovementTray(wasm: ManifoldToplevel, config: MovementTrayConfig): HolderBuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)

  try {
    if (config.slotDepth <= 0) throw new Error('Slots need a positive depth')
    if (config.floorThickness < minimumMovementTrayFloor(config) - 1e-9) {
      throw new Error('Tray floor leaves too little material below the magnet pockets')
    }
    if (config.rim < MIN_MOVEMENT_TRAY_RIM - 1e-9) throw new Error('Tray rim is too narrow to print')

    const layout = movementTrayLayout(config)
    const height = movementTrayHeight(config)
    const tolerance = curveTolerance(Math.max(layout.width, layout.length), config.segments)
    const segmentsFor = (diameter: number, previewMinimum: number) =>
      Math.max(config.segments <= 256 ? previewMinimum : 3, segmentsForTolerance(diameter, tolerance))
    const footprint = { shape: config.shape, width: config.width, length: config.length, cornerRadius: config.cornerRadius, sides: 6 }
    const clearance = config.slotClearance

    let recess: CrossSection
    let cornerRadius: number
    if (config.shape === 'round') {
      const diameter = config.width + clearance
      const slot = section(slotOutline(wasm, footprint, clearance, segmentsFor(diameter, 64)))
      recess = section(CrossSection.union(layout.slotCenters.map((center) => section(slot.translate([center.x, center.y])))))
      cornerRadius = diameter / 2 + config.rim
    } else {
      const block = { ...footprint, width: layout.recessWidth - clearance, length: layout.recessLength - clearance }
      cornerRadius = Math.max(
        0,
        Math.min(config.cornerRadius + clearance / 2, Math.min(layout.recessWidth, layout.recessLength) / 2 - 0.01),
      )
      recess = section(slotOutline(wasm, block, clearance, segmentsFor(cornerRadius * 2, 32)))
      cornerRadius += config.rim
    }

    cornerRadius = Math.min(cornerRadius, Math.min(layout.width, layout.length) / 2 - 0.01)
    const core = section(CrossSection.square([layout.width - cornerRadius * 2, layout.length - cornerRadius * 2], true))
    const outline = section(core.offset(cornerRadius, 'Round', 2, segmentsFor(cornerRadius * 2, 32)))
    const plate = solidOf(outline.extrude(height))
    const recessCut = solidOf(recess.extrude(config.slotDepth + 0.01))
    const cutters = [solidOf(recessCut.translate([0, 0, config.floorThickness]))]

    if (config.magnets.enabled) {
      const radius = (config.magnets.diameter + config.magnets.clearance) / 2
      const disc = section(CrossSection.circle(radius, segmentsFor(radius * 2, 32)))
      const magnets = holderSlotMagnetCenters(config, config)
      const discs = layout.slotCenters.flatMap((slot) =>
        magnets.map((magnet) => section(disc.translate([slot.x + magnet.x, slot.y + magnet.y]))),
      )
      if (discs.length > 0) {
        const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
        const drill = solidOf(section(CrossSection.union(discs)).extrude(pocketDepth + 0.01))
        cutters.push(solidOf(drill.translate([0, 0, config.floorThickness - pocketDepth])))
      }
    }

    const solid = solidOf(Manifold.difference([plate, ...cutters]))
    const volume = solid.volume()
    const triangles = solid.numTri()
    return { mesh: solid.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
