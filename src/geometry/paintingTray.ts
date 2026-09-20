import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { defaultHolderConfig, type HolderBuildResult } from './holder'
import { trimNumber } from './outline'
import { curveTolerance, segmentsForTolerance } from './quality'
import type { PaintingHandleConfig, PaintingTrayConfig } from './types'

const CORNER_RADIUS = 6
const MIN_FLOOR_THICKNESS = 0.6
const MIN_POCKET_WEB = 0.8
const PLA_DENSITY = 1.24e-3
const HANDLE_OUTER_WIDTH = 92
const HANDLE_OUTER_HEIGHT = 42
const HANDLE_OPENING_WIDTH = 78
const HANDLE_OPENING_HEIGHT = 28
const HANDLE_DEPTH = 18
const HANDLE_CORNER_RADIUS = 8
const HANDLE_PREVIEW_OVERLAP = 0.1

export interface PaintingTrayLayout {
  columns: number
  rows: number
  width: number
  length: number
  magnetCenters: { x: number; y: number }[]
}

export function paintingTrayLayout(config: PaintingTrayConfig): PaintingTrayLayout {
  const columns = Math.max(1, Math.round(config.columns))
  const rows = Math.max(1, Math.round(config.rows))
  const width = (columns - 1) * config.spacing + config.edgeMargin * 2
  const length = (rows - 1) * config.spacing + config.edgeMargin * 2
  const primaryCenters = Array.from({ length: rows }, (_rowValue, row) =>
    Array.from({ length: columns }, (_columnValue, column) => ({
      x: (column - (columns - 1) / 2) * config.spacing,
      y: (row - (rows - 1) / 2) * config.spacing,
    })),
  ).flat()
  const intermediateCenters = Array.from({ length: rows - 1 }, (_rowValue, row) =>
    Array.from({ length: columns - 1 }, (_columnValue, column) => ({
      x: (column - (columns - 2) / 2) * config.spacing,
      y: (row - (rows - 2) / 2) * config.spacing,
    })),
  ).flat()
  const magnetCenters = [...primaryCenters, ...intermediateCenters]
  return { columns, rows, width, length, magnetCenters }
}

export function paintingTrayMagnetPocketCount(config: PaintingTrayConfig): number {
  return paintingTrayLayout(config).magnetCenters.length
}

export function paintingHandleConfig(config: PaintingTrayConfig): PaintingHandleConfig {
  return {
    kind: 'painting-handle',
    segments: config.segments,
  }
}

export function paintingHandleDimensions(_config: PaintingHandleConfig) {
  return {
    width: HANDLE_OUTER_WIDTH,
    length: HANDLE_DEPTH,
    height: HANDLE_OUTER_HEIGHT,
  }
}

export function paintingTrayAssemblyHeight(config: PaintingTrayConfig): number {
  return config.height + paintingHandleDimensions(paintingHandleConfig(config)).height - HANDLE_PREVIEW_OVERLAP
}

export function paintingHandleDescription(): string {
  return `${HANDLE_OPENING_WIDTH} × ${HANDLE_OPENING_HEIGHT} mm opening`
}

export function minimumPaintingTrayHeight(config: {
  magnets: Pick<PaintingTrayConfig['magnets'], 'thickness' | 'depthClearance'>
}): number {
  return config.magnets.thickness + config.magnets.depthClearance + MIN_FLOOR_THICKNESS
}

export function minimumPaintingTraySpacing(config: { magnets: Pick<PaintingTrayConfig['magnets'], 'diameter' | 'clearance'> }): number {
  return (config.magnets.diameter + config.magnets.clearance + MIN_POCKET_WEB) * Math.SQRT2
}

export function minimumPaintingTrayEdgeMargin(config: { magnets: Pick<PaintingTrayConfig['magnets'], 'diameter' | 'clearance'> }): number {
  return (config.magnets.diameter + config.magnets.clearance) / 2 + MIN_POCKET_WEB
}

export function defaultPaintingTrayConfig(): PaintingTrayConfig {
  const holder = defaultHolderConfig()
  return {
    kind: 'painting-tray',
    columns: 4,
    rows: 4,
    spacing: 45,
    edgeMargin: 12,
    height: 3,
    magnets: { ...holder.magnets, enabled: true },
    segments: 160,
  }
}

export function paintingTrayName(config: PaintingTrayConfig): string {
  const layout = paintingTrayLayout(config)
  return `painting-tray-${layout.columns}x${layout.rows}-${trimNumber(layout.width)}x${trimNumber(layout.length)}mm`
}

export function paintingHandleName(config: PaintingTrayConfig): string {
  return `${paintingTrayName(config)}-handle`
}

type Owner = <T extends { delete: () => void }>(value: T) => T

function roundedRectangle(
  CrossSection: ManifoldToplevel['CrossSection'],
  width: number,
  length: number,
  radius: number,
  segments: number,
  section: Owner,
): CrossSection {
  const core = section(CrossSection.square([width - radius * 2, length - radius * 2], true))
  return section(core.offset(radius, 'Round', 2, segments))
}

function paintingHandleSolid(
  wasm: ManifoldToplevel,
  config: PaintingHandleConfig,
  section: Owner,
  solidOf: Owner,
  segmentsFor: (diameter: number, previewMinimum: number) => number,
): Manifold {
  const { CrossSection } = wasm
  const outer = roundedRectangle(
    CrossSection,
    HANDLE_OUTER_WIDTH,
    HANDLE_OUTER_HEIGHT,
    HANDLE_CORNER_RADIUS,
    segmentsFor(HANDLE_CORNER_RADIUS * 2, 32),
    section,
  )
  const inner = roundedRectangle(
    CrossSection,
    HANDLE_OPENING_WIDTH,
    HANDLE_OPENING_HEIGHT,
    HANDLE_CORNER_RADIUS / 2,
    segmentsFor(HANDLE_CORNER_RADIUS, 24),
    section,
  )
  const frameProfile = section(CrossSection.difference([outer, inner]))
  const frameExtrusion = solidOf(frameProfile.extrude(HANDLE_DEPTH))
  const rotatedFrame = solidOf(frameExtrusion.rotate([90, 0, 0]))
  return solidOf(rotatedFrame.translate([0, HANDLE_DEPTH / 2, -HANDLE_OUTER_HEIGHT / 2]))
}

export function buildPaintingHandle(wasm: ManifoldToplevel, config: PaintingHandleConfig): HolderBuildResult {
  const trash: { delete: () => void }[] = []
  const own: Owner = (value) => {
    trash.push(value)
    return value
  }

  try {
    const dimensions = paintingHandleDimensions(config)
    const tolerance = curveTolerance(Math.max(dimensions.width, dimensions.length), config.segments)
    const segmentsFor = (diameter: number, previewMinimum: number) =>
      Math.max(config.segments <= 256 ? previewMinimum : 3, segmentsForTolerance(diameter, tolerance))
    const assembled = paintingHandleSolid(wasm, config, own, own, segmentsFor)
    const rotated = own(assembled.rotate([90, 0, 0]))
    const bounds = rotated.boundingBox()
    const printable = own(rotated.translate([0, 0, -bounds.min[2]]))
    const volume = printable.volume()
    const triangles = printable.numTri()
    return { mesh: printable.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}

export function buildPaintingTray(wasm: ManifoldToplevel, config: PaintingTrayConfig): HolderBuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own: Owner = (value) => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)

  try {
    if (config.height < minimumPaintingTrayHeight(config)) {
      throw new Error('Tray thickness leaves too little material below the magnet pockets')
    }
    if (config.spacing < minimumPaintingTraySpacing(config)) {
      throw new Error('Magnet pitch leaves too little material between diagonal pockets')
    }
    if (config.edgeMargin < minimumPaintingTrayEdgeMargin(config)) {
      throw new Error('Edge margin leaves too little material beside the outer pockets')
    }

    const layout = paintingTrayLayout(config)
    const tolerance = curveTolerance(Math.max(layout.width, layout.length), config.segments)
    const segmentsFor = (diameter: number, previewMinimum: number) =>
      Math.max(config.segments <= 256 ? previewMinimum : 3, segmentsForTolerance(diameter, tolerance))

    const radius = Math.min(CORNER_RADIUS, layout.width / 2 - 0.01, layout.length / 2 - 0.01)
    const outline = roundedRectangle(CrossSection, layout.width, layout.length, radius, segmentsFor(radius * 2, 32), own)
    const plate = solidOf(outline.extrude(config.height))
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const pocket = section(CrossSection.circle(pocketRadius, segmentsFor(pocketRadius * 2, 32)))
    const pocketOutlines = layout.magnetCenters.map((center) => section(pocket.translate([center.x, center.y])))
    const pockets = section(CrossSection.union(pocketOutlines))
    const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
    const drill = solidOf(pockets.extrude(pocketDepth + 0.001))
    const cutter = solidOf(drill.translate([0, 0, config.height - pocketDepth]))
    const tray = solidOf(Manifold.difference([plate, cutter]))
    let solid = tray
    if (config.assembly !== false) {
      const handle = paintingHandleSolid(wasm, paintingHandleConfig(config), own, own, segmentsFor)
      const attachedHandle = solidOf(handle.translate([0, 0, HANDLE_PREVIEW_OVERLAP]))
      solid = solidOf(Manifold.union([tray, attachedHandle]))
    }
    const volume = solid.volume()
    const triangles = solid.numTri()
    return { mesh: solid.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
