import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { defaultHolderConfig, type HolderBuildResult } from './holder'
import { trimNumber } from './outline'
import { curveTolerance, segmentsForTolerance } from './quality'
import type { PaintingHandleConfig, PaintingHandleShape, PaintingTrayConfig } from './types'

const CORNER_RADIUS = 6
const MIN_FLOOR_THICKNESS = 0.6
const MIN_POCKET_WEB = 0.8
const PLA_DENSITY = 1.24e-3
const HANDLE_PREVIEW_OVERLAP = 0.1
const HANDLE_RIB_COUNT = 8
const CENTER_MARK_DEPTH = 0.3
const CENTER_MARK_WIDTH = 1
const CENTER_MARK_CLEARANCE = 8
const HANDLE_SHAPE_LABELS: Record<PaintingHandleShape, string> = {
  round: 'Round',
  oval: 'Oval barrel',
  flared: 'Flared',
  pistol: 'Pistol',
}

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

export function paintingTrayCenterMarkSpan(config: PaintingTrayConfig): number {
  const ribAllowance = config.handle.ribs ? Math.min(2.4, config.handle.width * 0.08) : 0
  return config.handle.width + ribAllowance + CENTER_MARK_CLEARANCE
}

export function paintingHandleConfig(config: PaintingTrayConfig): PaintingHandleConfig {
  return {
    kind: 'painting-handle',
    handle: { ...config.handle },
    segments: config.segments,
  }
}

function handleDepth(config: PaintingHandleConfig): number {
  return config.handle.shape === 'oval' ? config.handle.width * 0.75 : config.handle.width
}

function handleShapeScale(shape: PaintingHandleShape): number {
  return shape === 'oval' ? 1.12 : shape === 'flared' ? 1.25 : shape === 'pistol' ? 1.08 : 1
}

export function paintingHandleDimensions(config: PaintingHandleConfig) {
  const { handle } = config
  const scale = handleShapeScale(handle.shape)
  const ribAllowance = handle.ribs ? Math.min(2.4, handle.width * 0.08) : 0
  const offset = handle.length * Math.tan((handle.angle * Math.PI) / 180)
  const curve = handle.shape === 'pistol' ? handle.width * 0.22 : 0
  return {
    width: handle.width * scale + ribAllowance + Math.abs(offset) + curve,
    length: handleDepth(config) * scale + ribAllowance,
    height: handle.length,
  }
}

export function paintingTrayAssemblyHeight(config: PaintingTrayConfig): number {
  return config.height + paintingHandleDimensions(paintingHandleConfig(config)).height - HANDLE_PREVIEW_OVERLAP
}

export function paintingHandleAxisCenter(config: PaintingTrayConfig): [number, number, number] {
  const { handle } = config
  const leanOffset = (handle.length * Math.tan((handle.angle * Math.PI) / 180)) / 2
  const curveOffset = handle.shape === 'pistol' ? handle.width * 0.22 : 0
  const horizontal = leanOffset + curveOffset
  return [horizontal === 0 ? 0 : -horizontal, 0, HANDLE_PREVIEW_OVERLAP - handle.length / 2]
}

export function paintingTrayAssemblyMinZ(config: PaintingTrayConfig): number {
  return HANDLE_PREVIEW_OVERLAP - config.handle.length
}

export function paintingHandleDescription(config: PaintingTrayConfig): string {
  const { handle } = config
  const angle = handle.angle === 0 ? 'Straight' : `${trimNumber(handle.angle)}° lean`
  return `${HANDLE_SHAPE_LABELS[handle.shape]} · ${angle} · ${trimNumber(handle.width)} × ${trimNumber(handle.length)} mm`
}

export function minimumPaintingTrayHeight(config: {
  magnets: Pick<PaintingTrayConfig['magnets'], 'thickness' | 'depthClearance'>
}): number {
  return config.magnets.thickness + config.magnets.depthClearance + MIN_FLOOR_THICKNESS + CENTER_MARK_DEPTH
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
    spacing: 50,
    edgeMargin: 12,
    height: 3,
    magnets: { ...holder.magnets, enabled: true },
    handle: {
      shape: 'round',
      length: 100,
      width: 28,
      angle: 0,
      roundedEnd: false,
      ribs: false,
    },
    segments: 160,
  }
}

export function paintingTrayName(config: PaintingTrayConfig): string {
  const layout = paintingTrayLayout(config)
  return `painting-tray-${layout.columns}x${layout.rows}-${trimNumber(layout.width)}x${trimNumber(layout.length)}mm`
}

export function paintingHandleName(config: PaintingTrayConfig): string {
  const { handle } = config
  const options = [handle.ribs ? 'ribbed' : '', handle.roundedEnd ? 'rounded' : ''].filter(Boolean).join('-')
  return `${paintingTrayName(config)}-handle-${handle.shape}-${trimNumber(handle.width)}x${trimNumber(handle.length)}mm-${trimNumber(handle.angle)}deg${options ? `-${options}` : ''}`
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
  const { handle } = config
  const depth = handleDepth(config)
  const circle = section(CrossSection.circle(handle.width / 2, segmentsFor(handle.width, 32)))
  const base = depth === handle.width ? circle : section(circle.scale([1, depth / handle.width]))
  let profile = base
  if (handle.ribs) {
    const ribRadius = Math.min(1.2, handle.width * 0.04)
    const ribSegments = segmentsFor(ribRadius * 2, 12)
    const ribs = Array.from({ length: HANDLE_RIB_COUNT }, (_, index) => {
      const angle = (index * 2 * Math.PI) / HANDLE_RIB_COUNT
      const rib = section(CrossSection.circle(ribRadius, ribSegments))
      return section(rib.translate([(handle.width / 2) * Math.cos(angle), (depth / 2) * Math.sin(angle)]))
    })
    profile = section(CrossSection.union([base, ...ribs]))
  }
  const needsShaping = handle.shape !== 'round' || handle.roundedEnd
  const grip = solidOf(profile.extrude(handle.length, needsShaping ? 20 : 0))
  const lean = Math.tan((handle.angle * Math.PI) / 180)
  const leaning = solidOf(
    grip.warp((vertex) => {
      const position = vertex[2] / handle.length
      const swell =
        handle.shape === 'oval'
          ? 1 + 0.12 * Math.sin(Math.PI * position)
          : handle.shape === 'flared'
            ? 1 + 0.25 * Math.max(0, 1 - position / 0.25)
            : handle.shape === 'pistol'
              ? 1 + 0.08 * Math.sin(Math.PI * position)
              : 1
      const softenedEnd = handle.roundedEnd && position < 0.05 ? 0.86 + 2.8 * position : 1
      vertex[0] *= swell * softenedEnd
      vertex[1] *= swell * softenedEnd
      vertex[0] += vertex[2] * lean
      if (handle.shape === 'pistol') vertex[0] -= handle.width * 0.22 * Math.sin(Math.PI * position)
    }),
  )
  return solidOf(leaning.translate([-handle.length * lean, 0, -handle.length]))
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
    const bounds = assembled.boundingBox()
    const printable = own(assembled.translate([-(bounds.min[0] + bounds.max[0]) / 2, -(bounds.min[1] + bounds.max[1]) / 2, -bounds.min[2]]))
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
    const centerMarkSpan = paintingTrayCenterMarkSpan(config)
    const centerMarkHorizontal = section(CrossSection.square([centerMarkSpan, CENTER_MARK_WIDTH], true))
    const centerMarkVertical = section(CrossSection.square([CENTER_MARK_WIDTH, centerMarkSpan], true))
    const centerMark = section(CrossSection.union([centerMarkHorizontal, centerMarkVertical]))
    const centerMarkDrill = solidOf(centerMark.extrude(CENTER_MARK_DEPTH + 0.001))
    const centerMarkCutter = solidOf(centerMarkDrill.translate([0, 0, -0.001]))
    const markedPlate = solidOf(Manifold.difference([plate, centerMarkCutter]))
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const pocket = section(CrossSection.circle(pocketRadius, segmentsFor(pocketRadius * 2, 32)))
    const pocketOutlines = layout.magnetCenters.map((center) => section(pocket.translate([center.x, center.y])))
    const pockets = section(CrossSection.union(pocketOutlines))
    const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
    const drill = solidOf(pockets.extrude(pocketDepth + 0.001))
    const cutter = solidOf(drill.translate([0, 0, config.height - pocketDepth]))
    const tray = solidOf(Manifold.difference([markedPlate, cutter]))
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
