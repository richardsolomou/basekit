import type { CrossSection, Manifold, ManifoldToplevel, Mesh, Vec3 } from 'manifold-3d'
import type { Font } from 'opentype.js'
import { magnetPositions, supportsFivePocketCross } from './base'
import { fitLabel, LABEL_MARGIN, labelAngles, pointInContours, type LabelCircle } from './label'
import { isElongated, trimNumber } from './outline'
import { automaticMagnetCount, DEFAULT_SIZE, footprintKey, presetFor } from './presets'
import { curveTolerance, segmentsForTolerance } from './quality'
import { polygonsWidth, textPolygons, type Polygon } from './text'
import type { BaseStats, HolderConfig, HolderGroup, ShapeKind } from './types'

const GRID = 42
const GAP = 0.5
const BASE_HEIGHT = 7
const PROFILE = [
  { inset: 2.95, z: 0 },
  { inset: 2.15, z: 0.8 },
  { inset: 2.15, z: 2.6 },
  { inset: 0, z: 4.75 },
] as const
const CORNER_RADIUS = 3.75
const PLA_DENSITY = 1.24e-3
const MIN_SLOT_FLOOR_THICKNESS = 0.4
const ENGRAVING_DEPTH = 0.4
const HEX_ROW_HEIGHT = Math.sqrt(3) / 2
const MAX_CACHE_ENTRIES = 100

function cacheResult<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}

export interface HolderLayout {
  unitsWide: number
  unitsDeep: number
  width: number
  length: number
  slotCenters: HolderSlot[]
}

export interface HolderBuildResult {
  mesh: Mesh
  stats: BaseStats
}

export interface HolderModule {
  config: HolderConfig
  layout: HolderLayout
  column: number
  row: number
}

export interface HolderPlan {
  modules: HolderModule[]
  omitted: HolderGroup[]
  unitsWide: number
  unitsDeep: number
}

interface HolderSlot extends Omit<HolderGroup, 'quantity'> {
  x: number
  y: number
}

type HolderMagnetSettings = Pick<HolderConfig, 'magnetCounts' | 'magnets' | 'baseWallThickness' | 'magnetBossWall'>

const DEFAULT_MAGNET_SETTINGS: HolderMagnetSettings = {
  magnets: {
    enabled: true,
    layout: 'balanced',
    patternVersion: 2,
    maxCount: 8,
    diameter: 5,
    clearance: 0.2,
    depthClearance: 0.1,
    thickness: 2,
  },
  magnetCounts: {},
  baseWallThickness: 2,
  magnetBossWall: 0.9,
}

export function holderGroup(id: string, quantity: number, overrides: Partial<Omit<HolderGroup, 'id' | 'quantity'>> = {}): HolderGroup {
  const shape = overrides.shape ?? 'round'
  const preset = presetFor(DEFAULT_SIZE[shape])
  const width = overrides.width ?? preset.width
  const length = isElongated(shape) ? (overrides.length ?? preset.length) : width
  return {
    id,
    quantity,
    shape,
    width,
    length,
    cornerRadius: overrides.cornerRadius ?? Math.min(2, Math.min(width, length) * 0.06),
    sides: overrides.sides ?? 6,
  }
}

export function holderGroupLabel(group: Pick<HolderGroup, 'shape' | 'width' | 'length'>): string {
  const size = isElongated(group.shape) ? `${trimNumber(group.width)}×${trimNumber(group.length)}` : `Ø${trimNumber(group.width)}`
  return group.shape === 'round' ? size : `${shapeLabel(group.shape)} ${size}`
}

function holderGroupSizeLabel(group: Pick<HolderGroup, 'shape' | 'width' | 'length'>): string {
  return isElongated(group.shape) ? `${trimNumber(group.width)}×${trimNumber(group.length)}` : trimNumber(group.width)
}

function holderGroupNamePart(group: HolderGroup): string {
  const size = isElongated(group.shape) ? `${trimNumber(group.width)}x${trimNumber(group.length)}` : trimNumber(group.width)
  return `${group.quantity}x-${group.shape}-${size}mm`
}

function shapeLabel(shape: ShapeKind): string {
  if (shape === 'rect') return 'rectangle'
  if (shape === 'polygon') return 'hex'
  return shape
}

function slotWidth(slot: Pick<HolderGroup, 'width'>) {
  return slot.width
}

function slotLength(slot: Pick<HolderGroup, 'shape' | 'width' | 'length'>) {
  return isElongated(slot.shape) ? slot.length : slot.width
}

export function holderSlotMagnetCenters(
  slot: Pick<HolderGroup, 'shape' | 'width' | 'length'>,
  settings: HolderMagnetSettings = DEFAULT_MAGNET_SETTINGS,
) {
  const base = presetFor(
    {
      label: '',
      shape: slot.shape,
      width: slotWidth(slot),
      length: slotLength(slot),
      use: '',
    },
    settings.magnets.maxCount,
    settings.magnets.patternVersion,
  )
  const fiveCross =
    settings.magnets.layout === 'five-cross' &&
    (settings.magnets.patternVersion === 1 || supportsFivePocketCross(slot.shape, slotWidth(slot)))
  const count = fiveCross
    ? 5
    : settings.magnets.patternVersion === 1
      ? (settings.magnetCounts[footprintKey(slot.shape, slot.width, slot.length)] ?? base.magnets.count)
      : (settings.magnetCounts[footprintKey(slot.shape, slot.width, slot.length)] ??
        automaticMagnetCount(
          slotWidth(slot),
          slotLength(slot),
          settings.magnets.maxCount,
          settings.magnets.diameter,
          settings.magnets.thickness,
        ))
  const pocketRadius = (settings.magnets.diameter + settings.magnets.clearance) / 2
  const bossRadius = pocketRadius + settings.magnetBossWall
  const halfWidth = Math.max(0, slotWidth(slot) / 2 - settings.baseWallThickness)
  const halfLength = Math.max(0, slotLength(slot) / 2 - settings.baseWallThickness)
  return magnetPositions(count, halfWidth, halfLength, bossRadius + LABEL_MARGIN, {
    ellipticalRow: slot.shape === 'oval',
    layout: fiveCross ? 'five-cross' : 'balanced',
  }).map(({ x, y }) => ({ x, y }))
}

export function holderMagnetPocketCount(config: HolderConfig): number {
  return holderLayout(config).slotCenters.reduce((total, slot) => total + holderSlotMagnetCenters(slot, config).length, 0)
}

function maxPossibleGroupQuantity(
  group: Pick<HolderGroup, 'shape' | 'width' | 'length'>,
  maxColumns: number,
  maxRows: number,
  spacing: number,
  edgeSpacing: number,
  clearance: number,
) {
  const width = maxColumns * GRID - GAP - edgeSpacing * 2
  const length = maxRows * GRID - GAP - edgeSpacing * 2
  const itemWidth = slotWidth(group) + clearance
  const itemLength = slotLength(group) + clearance
  if (itemWidth > width || itemLength > length) return 0
  const pitchX = itemWidth + spacing
  const pitchY = itemLength + spacing
  const aligned = Math.floor((width + spacing) / pitchX) * Math.floor((length + spacing) / pitchY)
  if ((group.shape !== 'round' && group.shape !== 'polygon') || itemWidth !== itemLength) return Math.max(0, aligned)

  const rowPitch = pitchX * HEX_ROW_HEIGHT
  const horizontal = Math.floor((width - itemWidth) / pitchX + 1) * Math.floor((length - itemLength) / rowPitch + 1)
  const vertical = Math.floor((length - itemLength) / pitchX + 1) * Math.floor((width - itemWidth) / rowPitch + 1)
  const areaBound = Math.floor((width * length) / (Math.PI * (itemWidth / 2) ** 2))
  let lower = Math.max(0, aligned, horizontal, vertical)
  let upper = areaBound
  while (lower < upper) {
    const candidate = Math.ceil((lower + upper) / 2)
    if (staggeredPacking(candidate, itemWidth, width, length, spacing)) lower = candidate
    else upper = candidate - 1
  }
  return lower
}

export function maxHolderSlotDepth(config: HolderConfig): number {
  const engravingDepth = config.engraving.enabled && config.engraving.placement === 'slots' ? ENGRAVING_DEPTH : 0
  const magnetDepth = config.magnets.enabled ? config.magnets.thickness + config.magnets.depthClearance : 0
  return config.height - PROFILE.at(-1)!.z - MIN_SLOT_FLOOR_THICKNESS - Math.max(engravingDepth, magnetDepth)
}

export function maxHolderMagnetThickness(config: HolderConfig): number {
  return config.height - config.slotDepth - PROFILE.at(-1)!.z - MIN_SLOT_FLOOR_THICKNESS - config.magnets.depthClearance
}

export function minHolderHeight(config: HolderConfig): number {
  const engravingDepth = config.engraving.enabled && config.engraving.placement === 'slots' ? ENGRAVING_DEPTH : 0
  const magnetDepth = config.magnets.enabled ? config.magnets.thickness + config.magnets.depthClearance : 0
  const required = PROFILE.at(-1)!.z + MIN_SLOT_FLOOR_THICKNESS + config.slotDepth + Math.max(engravingDepth, magnetDepth)
  return Math.max(BASE_HEIGHT, Math.ceil((required - 1e-6) / BASE_HEIGHT) * BASE_HEIGHT)
}

function distributed(points: HolderSlot[], width: number, length: number) {
  const minX = Math.min(...points.map((point) => point.x - slotWidth(point) / 2))
  const maxX = Math.max(...points.map((point) => point.x + slotWidth(point) / 2))
  const minY = Math.min(...points.map((point) => point.y - slotLength(point) / 2))
  const maxY = Math.max(...points.map((point) => point.y + slotLength(point) / 2))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const centred = points.map((point) => ({ ...point, x: point.x - cx, y: point.y - cy }))
  let scale = Infinity
  for (const point of centred) {
    if (Math.abs(point.x) > 1e-9) scale = Math.min(scale, (width / 2 - slotWidth(point) / 2) / Math.abs(point.x))
    if (Math.abs(point.y) > 1e-9) scale = Math.min(scale, (length / 2 - slotLength(point) / 2) / Math.abs(point.y))
  }
  scale = Number.isFinite(scale) ? Math.max(1, scale) : 1
  return centred.map((point) => ({ ...point, x: point.x * scale, y: point.y * scale }))
}

function randomFor(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
}

function validPacking(points: { x: number; y: number; diameter: number }[], width: number, length: number, spacing: number) {
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (Math.abs(point.x) > width / 2 - point.diameter / 2 + 1e-6 || Math.abs(point.y) > length / 2 - point.diameter / 2 + 1e-6)
      return false
    for (let j = 0; j < i; j++) {
      const other = points[j]
      if (Math.hypot(point.x - other.x, point.y - other.y) < (point.diameter + other.diameter) / 2 + spacing - 1e-6) return false
    }
  }
  return true
}

function staggeredPacking(count: number, diameter: number, width: number, length: number, spacing: number) {
  const attempt = (outerWidth: number, outerLength: number) => {
    const pitch = diameter + spacing
    const across = Math.floor((outerWidth - diameter) / pitch) + 1
    if (across <= 0) return undefined
    const span = (across - 1) * pitch
    const slack = outerWidth - diameter - span
    const crossShift = across === 1 ? slack : Math.min(slack, pitch - slack)
    const downPitch = Math.sqrt(Math.max(pitch * pitch - crossShift * crossShift, 0))
    if (downPitch <= 1e-6) return undefined
    const down = Math.floor((outerLength - diameter) / downPitch) + 1
    if (across * down < count) return undefined
    const usedRows = Math.ceil(count / across)
    return Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / across)
      const inRow = Math.min(across, count - row * across)
      const rowSpan = (inRow - 1) * pitch
      const offset = row % 2 === 0 ? -slack / 2 : slack / 2
      return {
        diameter,
        x: (index % across) * pitch - rowSpan / 2 + offset,
        y: (row - (usedRows - 1) / 2) * downPitch,
      }
    })
  }
  const horizontal = attempt(width, length)
  if (horizontal && validPacking(horizontal, width, length, spacing)) return horizontal
  const vertical = attempt(length, width)?.map((point) => ({ ...point, x: point.y, y: point.x }))
  return vertical && validPacking(vertical, width, length, spacing) ? vertical : undefined
}

function relaxedPacking(diameters: number[], width: number, length: number, spacing: number) {
  const uniformDiameter = diameters[0]
  if (uniformDiameter !== undefined && diameters.every((candidate) => candidate === uniformDiameter)) {
    const pitch = uniformDiameter + spacing
    const across = Math.floor((width - uniformDiameter) / pitch) + 1
    const down = Math.floor((length - uniformDiameter) / pitch) + 1
    if (across * down >= diameters.length) {
      const usedRows = Math.ceil(diameters.length / across)
      return Array.from({ length: diameters.length }, (_, index) => {
        const row = Math.floor(index / across)
        const inRow = Math.min(across, diameters.length - row * across)
        return {
          diameter: uniformDiameter,
          x: ((index % across) - (inRow - 1) / 2) * pitch,
          y: (row - (usedRows - 1) / 2) * pitch,
        }
      })
    }
    const staggered = staggeredPacking(diameters.length, uniformDiameter, width, length, spacing)
    if (staggered) return staggered
  }
  const shelves: { diameter: number; count: number }[] = []
  for (const shelfDiameter of [...new Set(diameters)].sort((a, b) => b - a)) {
    const count = diameters.filter((candidate) => candidate === shelfDiameter).length
    const across = Math.floor((width + spacing) / (shelfDiameter + spacing))
    if (across <= 0) break
    for (let remaining = count; remaining > 0; remaining -= across)
      shelves.push({ diameter: shelfDiameter, count: Math.min(across, remaining) })
  }
  const shelfHeight = shelves.reduce((total, shelf) => total + shelf.diameter, 0) + Math.max(0, shelves.length - 1) * spacing
  if (shelves.reduce((total, shelf) => total + shelf.count, 0) === diameters.length && shelfHeight <= length) {
    let y = -shelfHeight / 2
    const packed = shelves.flatMap((shelf) => {
      const centerY = y + shelf.diameter / 2
      y += shelf.diameter + spacing
      return Array.from({ length: shelf.count }, (_, index) => ({
        diameter: shelf.diameter,
        x: (index - (shelf.count - 1) / 2) * (shelf.diameter + spacing),
        y: centerY,
      }))
    })
    if (validPacking(packed, width, length, spacing)) return packed
  }
  const seeds = diameters.length <= 12 ? 8 : diameters.length <= 24 ? 2 : 1
  const iterations = diameters.length <= 12 ? 350 : diameters.length <= 24 ? 120 : 60
  for (let seed = 1; seed <= seeds; seed++) {
    const random = randomFor(seed * 7919 + diameters.length)
    const points = diameters.map((diameter) => {
      const halfWidth = width / 2 - diameter / 2
      const halfLength = length / 2 - diameter / 2
      return { diameter, x: (random() * 2 - 1) * halfWidth, y: (random() * 2 - 1) * halfLength }
    })
    for (let iteration = 0; iteration < iterations; iteration++) {
      let largestOverlap = 0
      for (let i = 0; i < points.length; i++) {
        for (let j = 0; j < i; j++) {
          let dx = points[i].x - points[j].x
          let dy = points[i].y - points[j].y
          let distance = Math.hypot(dx, dy)
          if (distance < 1e-9) {
            dx = random() - 0.5
            dy = random() - 0.5
            distance = Math.hypot(dx, dy)
          }
          const overlap = (points[i].diameter + points[j].diameter) / 2 + spacing - distance
          if (overlap <= 0) continue
          largestOverlap = Math.max(largestOverlap, overlap)
          const push = (overlap * 0.51) / distance
          points[i].x += dx * push
          points[i].y += dy * push
          points[j].x -= dx * push
          points[j].y -= dy * push
          for (const point of [points[i], points[j]]) {
            const halfWidth = width / 2 - point.diameter / 2
            const halfLength = length / 2 - point.diameter / 2
            point.x = Math.max(-halfWidth, Math.min(halfWidth, point.x))
            point.y = Math.max(-halfLength, Math.min(halfLength, point.y))
          }
        }
      }
      if (largestOverlap < 1e-5 && validPacking(points, width, length, spacing)) return points
    }
  }
  return undefined
}

function validBoxPacking(points: HolderSlot[], width: number, length: number, spacing: number) {
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (Math.abs(point.x) > width / 2 - slotWidth(point) / 2 + 1e-6 || Math.abs(point.y) > length / 2 - slotLength(point) / 2 + 1e-6)
      return false
    for (let j = 0; j < i; j++) {
      const other = points[j]
      const separatedX = Math.abs(point.x - other.x) >= (slotWidth(point) + slotWidth(other)) / 2 + spacing - 1e-6
      const separatedY = Math.abs(point.y - other.y) >= (slotLength(point) + slotLength(other)) / 2 + spacing - 1e-6
      if (!separatedX && !separatedY) return false
    }
  }
  return true
}

function boxPacking(items: HolderSlot[], width: number, length: number, spacing: number) {
  const sorted = [...items].sort((a, b) => slotLength(b) - slotLength(a) || slotWidth(b) - slotWidth(a))
  const rows: HolderSlot[][] = []
  const rowWidths: number[] = []
  const rowHeights: number[] = []
  for (const item of sorted) {
    if (slotWidth(item) > width || slotLength(item) > length) return undefined
    let placed = false
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const nextWidth = rowWidths[rowIndex] + spacing + slotWidth(item)
      if (nextWidth > width) continue
      rows[rowIndex].push(item)
      rowWidths[rowIndex] = nextWidth
      rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], slotLength(item))
      placed = true
      break
    }
    if (!placed) {
      rows.push([item])
      rowWidths.push(slotWidth(item))
      rowHeights.push(slotLength(item))
    }
  }
  const totalHeight = rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rows.length - 1) * spacing
  if (totalHeight > length) return undefined
  let y = -totalHeight / 2
  const packed: HolderSlot[] = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const rowHeight = rowHeights[rowIndex]
    let x = -rowWidths[rowIndex] / 2
    for (const item of row) {
      packed.push({ ...item, x: x + slotWidth(item) / 2, y: y + rowHeight / 2 })
      x += slotWidth(item) + spacing
    }
    y += rowHeight + spacing
  }
  return validBoxPacking(packed, width, length, spacing) ? packed : undefined
}

const layoutCache = new Map<string, HolderLayout>()

function singleHolderLayout(
  config: Pick<HolderConfig, 'groups' | 'maxColumns' | 'maxRows' | 'spacing' | 'edgeSpacing' | 'slotClearance'>,
): HolderLayout {
  const maxColumns = Math.max(1, Math.round(config.maxColumns))
  const maxRows = Math.max(1, Math.round(config.maxRows))
  const groups = config.groups
    .filter((group) => group.quantity > 0)
    .map((group) => ({
      ...group,
      quantity: Math.min(
        Math.round(group.quantity),
        maxPossibleGroupQuantity(group, maxColumns, maxRows, config.spacing, config.edgeSpacing, config.slotClearance),
      ),
      length: slotLength(group),
    }))
    .filter((group) => group.quantity > 0)
  const slots = groups
    .flatMap((group) =>
      Array.from({ length: group.quantity }, (_, index): HolderSlot => ({ ...group, id: `${group.id}-${index}`, x: 0, y: 0 })),
    )
    .sort((a, b) => Math.max(slotWidth(b), slotLength(b)) - Math.max(slotWidth(a), slotLength(a)))
  const key = `${maxColumns}:${maxRows}:${config.spacing}:${config.edgeSpacing}:${config.slotClearance}:${groups
    .map((group) => `${group.quantity}x${group.shape}-${group.width}x${slotLength(group)}-${group.cornerRadius}-${group.sides}`)
    .join(',')}`
  const cached = layoutCache.get(key)
  if (cached) return cached
  const largestWidth = Math.max(0, ...slots.map(slotWidth))
  const minimumColumns = Math.max(1, Math.ceil((largestWidth + config.slotClearance + config.edgeSpacing * 2 + GAP) / GRID))
  let layout: HolderLayout | undefined
  for (let unitsWide = minimumColumns; unitsWide <= maxColumns && !layout; unitsWide++) {
    const width = unitsWide * GRID - GAP
    const packingWidth = width - config.edgeSpacing * 2
    for (let unitsDeep = 1; unitsDeep <= maxRows; unitsDeep++) {
      const length = unitsDeep * GRID - GAP
      const packingLength = length - config.edgeSpacing * 2
      if (
        slots.some(
          (slot) => slotWidth(slot) + config.slotClearance > packingWidth || slotLength(slot) + config.slotClearance > packingLength,
        )
      )
        continue
      const circleSlots = slots.every(
        (slot) => (slot.shape === 'round' || slot.shape === 'polygon') && slotWidth(slot) === slotLength(slot),
      )
      const packed = circleSlots
        ? relaxedPacking(
            slots.map((slot) => slotWidth(slot) + config.slotClearance),
            packingWidth,
            packingLength,
            config.spacing,
          )?.map((point, index) => ({
            ...slots[index],
            width: slots[index].width + config.slotClearance,
            length: slots[index].length + config.slotClearance,
            x: point.x,
            y: point.y,
          }))
        : boxPacking(
            slots.map((slot) => ({ ...slot, width: slot.width + config.slotClearance, length: slot.length + config.slotClearance })),
            packingWidth,
            packingLength,
            config.spacing,
          )
      if (packed) {
        const distributedSlots = distributed(packed, packingWidth, packingLength)
        layout = {
          unitsWide,
          unitsDeep,
          width,
          length,
          slotCenters: distributedSlots.map((point) => ({ ...slots.find((slot) => slot.id === point.id)!, x: point.x, y: point.y })),
        }
        break
      }
    }
  }
  layout ??= { unitsWide: maxColumns, unitsDeep: maxRows, width: maxColumns * GRID - GAP, length: maxRows * GRID - GAP, slotCenters: [] }
  return cacheResult(layoutCache, key, layout)
}

const planCache = new Map<string, HolderPlan>()

export function holderPlan(config: HolderConfig): HolderPlan {
  const columns = Math.max(1, Math.round(config.maxColumns))
  const rows = Math.max(1, Math.round(config.maxRows))
  const key = JSON.stringify(config)
  const cached = planCache.get(key)
  if (cached) return cached
  const addOmitted = (omitted: HolderGroup[], group: HolderGroup, quantity: number) => {
    if (quantity <= 0) return
    const existing = omitted.find((entry) => entry.id === group.id)
    if (existing) existing.quantity += quantity
    else omitted.push({ ...group, quantity })
  }

  if (!config.splitGroups) {
    const groups = config.groups.map((group) => ({
      ...group,
      quantity: Math.min(
        Math.max(0, Math.round(group.quantity)),
        maxPossibleGroupQuantity(group, columns, rows, config.spacing, config.edgeSpacing, config.slotClearance),
      ),
    }))
    let layout: HolderLayout | undefined
    while (groups.some((group) => group.quantity > 0)) {
      const candidate = singleHolderLayout({ ...config, groups })
      if (candidate.slotCenters.length === groups.reduce((total, group) => total + group.quantity, 0)) {
        layout = candidate
        break
      }
      for (let index = groups.length - 1; index >= 0; index--) {
        if (groups[index].quantity <= 0) continue
        groups[index].quantity--
        break
      }
    }
    const fitted = groups.filter((group) => group.quantity > 0)
    const omitted = config.groups.flatMap((group) => {
      const quantity = group.quantity - (groups.find((fittedGroup) => fittedGroup.id === group.id)?.quantity ?? 0)
      return quantity > 0 ? [{ ...group, quantity }] : []
    })
    const plan: HolderPlan = layout
      ? {
          modules: [
            {
              config: { ...config, groups: fitted, maxColumns: layout.unitsWide, maxRows: layout.unitsDeep },
              layout,
              column: 0,
              row: 0,
            },
          ],
          omitted,
          unitsWide: layout.unitsWide,
          unitsDeep: layout.unitsDeep,
        }
      : { modules: [], omitted, unitsWide: 1, unitsDeep: 1 }
    return cacheResult(planCache, key, plan)
  }

  const occupied = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false))
  const modules: HolderModule[] = []
  const omitted: HolderPlan['omitted'] = []
  const fitsAt = (column: number, row: number, wide: number, deep: number) => {
    if (column + wide > columns || row + deep > rows) return false
    for (let y = row; y < row + deep; y++) for (let x = column; x < column + wide; x++) if (occupied[y][x]) return false
    return true
  }

  for (const group of config.groups) {
    const requested = Math.max(0, Math.round(group.quantity))
    let remaining = Math.min(
      requested,
      maxPossibleGroupQuantity(group, columns, rows, config.spacing, config.edgeSpacing, config.slotClearance),
    )
    addOmitted(omitted, group, requested - remaining)
    while (true) {
      if (remaining <= 0) break
      let placed = false
      for (let quantity = remaining; quantity >= 1 && !placed; quantity--) {
        const tryRows = (rowLimits: number[]) => {
          const candidates = new Map<string, { layout: HolderLayout; config: HolderConfig }>()
          for (const maxRows of rowLimits) {
            const moduleConfig = { ...config, groups: [{ ...group, quantity }], maxColumns: columns, maxRows }
            const layout = singleHolderLayout(moduleConfig)
            if (layout.slotCenters.length !== quantity) continue
            candidates.set(`${layout.unitsWide}:${layout.unitsDeep}`, {
              layout,
              config: { ...moduleConfig, maxColumns: layout.unitsWide, maxRows: layout.unitsDeep },
            })
          }
          const ordered = [...candidates.values()].sort(
            (a, b) =>
              a.layout.unitsWide * a.layout.unitsDeep - b.layout.unitsWide * b.layout.unitsDeep || a.layout.unitsWide - b.layout.unitsWide,
          )
          for (const candidate of ordered) {
            for (let row = 0; row <= rows - candidate.layout.unitsDeep; row++) {
              for (let column = 0; column <= columns - candidate.layout.unitsWide; column++) {
                if (!fitsAt(column, row, candidate.layout.unitsWide, candidate.layout.unitsDeep)) continue
                for (let y = row; y < row + candidate.layout.unitsDeep; y++)
                  for (let x = column; x < column + candidate.layout.unitsWide; x++) occupied[y][x] = true
                modules.push({ ...candidate, column, row })
                remaining -= quantity
                return true
              }
            }
          }
          return false
        }
        placed = tryRows([rows]) || tryRows(Array.from({ length: rows - 1 }, (_, index) => index + 1))
      }
      if (!placed) {
        addOmitted(omitted, group, remaining)
        break
      }
    }
  }

  const unitsWide = Math.max(1, ...modules.map((module) => module.column + module.layout.unitsWide))
  const unitsDeep = Math.max(1, ...modules.map((module) => module.row + module.layout.unitsDeep))
  const plan = { modules, omitted, unitsWide, unitsDeep }
  return cacheResult(planCache, key, plan)
}

export function holderLayout(config: HolderConfig): HolderLayout {
  const plan = holderPlan(config)
  const width = plan.unitsWide * GRID - GAP
  const length = plan.unitsDeep * GRID - GAP
  const slotCenters = plan.modules.flatMap((module) => {
    const offsetX = (module.column + module.layout.unitsWide / 2 - plan.unitsWide / 2) * GRID
    const offsetY = (module.row + module.layout.unitsDeep / 2 - plan.unitsDeep / 2) * GRID
    return module.layout.slotCenters.map((slot) => ({ ...slot, x: slot.x + offsetX, y: slot.y + offsetY }))
  })
  return { unitsWide: plan.unitsWide, unitsDeep: plan.unitsDeep, width, length, slotCenters }
}

export function defaultHolderConfig(): HolderConfig {
  return {
    kind: 'holder',
    groups: [holderGroup('models-1', 5, { width: 32 })],
    maxColumns: 7,
    maxRows: 5,
    splitGroups: true,
    engraving: { enabled: true, placement: 'slots' },
    spacing: 0.5,
    edgeSpacing: 0.25,
    slotClearance: 0.5,
    slotDepth: 3,
    height: 14,
    ...DEFAULT_MAGNET_SETTINGS,
    magnets: { ...DEFAULT_MAGNET_SETTINGS.magnets },
    magnetCounts: { ...DEFAULT_MAGNET_SETTINGS.magnetCounts },
    segments: 160,
  }
}

export function holderName(config: HolderConfig): string {
  const layout = holderLayout(config)
  const models = config.groups.map(holderGroupNamePart).join('-')
  return `holder-${layout.unitsWide}x${layout.unitsDeep}-${models}`
}

function slotOutline(wasm: ManifoldToplevel, slot: HolderSlot, clearance: number, segments: number): CrossSection {
  const { CrossSection } = wasm
  const width = slotWidth(slot) + clearance
  const length = slotLength(slot) + clearance
  if (slot.shape === 'round') return CrossSection.circle(width / 2, segments)
  if (slot.shape === 'oval') return CrossSection.circle(1, segments).scale([width / 2, length / 2])
  if (slot.shape === 'pill') {
    const radius = Math.min(width, length) / 2
    const straight = Math.max(width - length, 0)
    if (straight <= 0) return CrossSection.circle(radius, segments)
    const cap = CrossSection.circle(radius, segments)
    return CrossSection.union([
      CrossSection.square([straight, length], true),
      cap.translate([straight / 2, 0]),
      cap.translate([-straight / 2, 0]),
    ])
  }
  if (slot.shape === 'polygon') return CrossSection.circle(width / 2, Math.max(3, Math.round(slot.sides)))
  const radius = Math.max(0, Math.min(slot.cornerRadius + clearance / 2, Math.min(width, length) / 2 - 0.01))
  if (radius <= 0) return CrossSection.square([width, length], true)
  return CrossSection.square([width - radius * 2, length - radius * 2], true).offset(radius, 'Round', 2, segments)
}

function buildSingleHolder(wasm: ManifoldToplevel, config: HolderConfig, font?: Font): HolderBuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)

  try {
    if (config.maxColumns < 1 || config.maxRows < 1) throw new Error('A holder needs at least one allowed row and column')
    if (config.height < BASE_HEIGHT) throw new Error('Holder height must be at least one Gridfinity unit')
    if (config.slotDepth > maxHolderSlotDepth(config)) throw new Error('Slots leave too little material above the Gridfinity foot')

    const layout = singleHolderLayout(config)
    if (layout.slotCenters.length === 0) throw new Error('Miniatures do not fit within the maximum Gridfinity rows and columns')
    const tolerance = curveTolerance(Math.max(layout.width, layout.length), config.segments)
    const preview = config.segments <= 256
    const segmentsFor = (diameter: number, previewMinimum: number) =>
      Math.max(preview ? previewMinimum : 3, segmentsForTolerance(diameter, tolerance))
    const profileSegments = segmentsFor(CORNER_RADIUS * 2, 32)
    const roundedRect = (outerWidth: number, outerLength: number, inset: number) => {
      const width = outerWidth - inset * 2
      const length = outerLength - inset * 2
      const radius = Math.max(0.01, CORNER_RADIUS - inset)
      return section(CrossSection.square([width - radius * 2, length - radius * 2], true).offset(radius, 'Round', 2, profileSegments))
    }
    const pointsAt = (outline: CrossSection, z: number): Vec3[] =>
      outline.toPolygons().flatMap((ring) => ring.map(([x, y]): Vec3 => [x, y, z]))

    const footSegments: Manifold[] = []
    for (let i = 0; i < PROFILE.length - 1; i++) {
      const from = roundedRect(GRID - GAP, GRID - GAP, PROFILE[i].inset)
      const to = roundedRect(GRID - GAP, GRID - GAP, PROFILE[i + 1].inset)
      footSegments.push(solidOf(Manifold.hull([...pointsAt(from, PROFILE[i].z), ...pointsAt(to, PROFILE[i + 1].z)])))
    }
    const foot = solidOf(Manifold.union(footSegments))
    const feet: Manifold[] = []
    for (let unitY = 0; unitY < layout.unitsDeep; unitY++) {
      for (let unitX = 0; unitX < layout.unitsWide; unitX++) {
        const x = (unitX - (layout.unitsWide - 1) / 2) * GRID
        const y = (unitY - (layout.unitsDeep - 1) / 2) * GRID
        feet.push(solidOf(foot.translate([x, y, 0])))
      }
    }
    const top = roundedRect(layout.width, layout.length, 0)
    const bridge = solidOf(top.extrude(config.height - PROFILE.at(-1)!.z))
    const raisedBridge = solidOf(bridge.translate([0, 0, PROFILE.at(-1)!.z]))
    let solid = solidOf(Manifold.union([...feet, raisedBridge]))

    const slotOutlines = layout.slotCenters.map((slot) => {
      const detail = Math.max(slotWidth(slot), slotLength(slot)) + config.slotClearance
      return section(slotOutline(wasm, slot, config.slotClearance, segmentsFor(detail, 64)).translate([slot.x, slot.y]))
    })
    const slots = section(CrossSection.union(slotOutlines))
    const slotCut = solidOf(slots.extrude(config.slotDepth + 0.01))
    const cutters = [solidOf(slotCut.translate([0, 0, config.height - config.slotDepth]))]

    if (config.magnets.enabled) {
      const radius = (config.magnets.diameter + config.magnets.clearance) / 2
      const magnetDisc = section(CrossSection.circle(radius, segmentsFor(radius * 2, 32)))
      const magnetOutlines = layout.slotCenters.flatMap((slot) =>
        holderSlotMagnetCenters(slot, config).map((center) => section(magnetDisc.translate([slot.x + center.x, slot.y + center.y]))),
      )
      if (magnetOutlines.length > 0) {
        const magnets = section(CrossSection.union(magnetOutlines))
        const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
        const drill = solidOf(magnets.extrude(pocketDepth + 0.001))
        const pocketFloor = config.height - config.slotDepth - pocketDepth
        cutters.push(solidOf(drill.translate([0, 0, pocketFloor])))
      }
    }

    if (config.engraving.enabled && font) {
      const depth = ENGRAVING_DEPTH
      const textSection = (text: string, height: number, maxWidth: number, x: number, y: number) => {
        const polygons = textPolygons(font, text, height)
        const width = polygonsWidth(polygons)
        const scale = width > maxWidth ? maxWidth / width : 1
        const scaled: Polygon[] = polygons.map((polygon) => polygon.map(([px, py]): [number, number] => [px * scale + x, py * scale + y]))
        return section(CrossSection.ofPolygons(scaled, 'EvenOdd'))
      }

      if (config.engraving.placement === 'slots') {
        const labels: CrossSection[] = []
        for (const slot of layout.slotCenters) {
          const label = holderGroupSizeLabel(slot)
          const narrow = Math.min(slotWidth(slot), slotLength(slot))
          const height = Math.min(4, narrow * 0.14)
          const polygons = textPolygons(font, label.replace(/^Ø/, ''), height)
          if (polygons.length === 0) continue
          const room = section(
            slotOutline(wasm, slot, 0, segmentsFor(Math.max(slotWidth(slot), slotLength(slot)), 64)).offset(-LABEL_MARGIN),
          )
          if (room.isEmpty()) continue
          const roomBounds = room.bounds()
          const reach = Math.hypot((roomBounds.max[0] - roomBounds.min[0]) / 2, (roomBounds.max[1] - roomBounds.min[1]) / 2)
          const contours = room.toPolygons()
          const obstacles: LabelCircle[] = config.magnets.enabled
            ? holderSlotMagnetCenters(slot, config).map((center) => ({
                ...center,
                r: (config.magnets.diameter + config.magnets.clearance) / 2,
              }))
            : []
          const fit = fitLabel(
            polygonsWidth(polygons),
            height,
            reach,
            (x, y) => pointInContours(contours, x, y),
            obstacles,
            labelAngles([], obstacles),
          )
          if (!fit) continue
          const placed: Polygon[] = polygons.map((polygon) =>
            polygon.map(([px, py]): [number, number] => [slot.x + px * fit.scale + fit.x, slot.y + py * fit.scale + fit.y]),
          )
          labels.push(section(CrossSection.ofPolygons(placed, 'EvenOdd')))
        }
        if (labels.length > 0) {
          const outlines = section(CrossSection.union(labels))
          const cut = solidOf(outlines.extrude(depth + 0.01))
          cutters.push(solidOf(cut.translate([0, 0, config.height - config.slotDepth - depth])))
        }
      } else {
        const text = [...new Set(config.groups.map(holderGroupSizeLabel))].join(' / ')
        let placed: CrossSection | undefined
        for (let height = 4; height >= 2 && !placed; height -= 0.5) {
          const polygons = textPolygons(font, text, height)
          const width = polygonsWidth(polygons)
          const halfWidth = width / 2
          const halfHeight = height / 2
          let best: { x: number; y: number; clearance: number } | undefined
          for (let y = -layout.length / 2 + halfHeight + 3; y <= layout.length / 2 - halfHeight - 3; y += 2) {
            for (let x = -layout.width / 2 + halfWidth + 3; x <= layout.width / 2 - halfWidth - 3; x += 2) {
              const clearance = Math.min(
                ...layout.slotCenters.map((slot) => {
                  if (slot.shape === 'round' || slot.shape === 'polygon') {
                    const dx = Math.max(Math.abs(slot.x - x) - halfWidth, 0)
                    const dy = Math.max(Math.abs(slot.y - y) - halfHeight, 0)
                    return Math.hypot(dx, dy) - (slotWidth(slot) + config.slotClearance) / 2
                  }
                  const dx = Math.abs(slot.x - x) - halfWidth - (slotWidth(slot) + config.slotClearance) / 2
                  const dy = Math.abs(slot.y - y) - halfHeight - (slotLength(slot) + config.slotClearance) / 2
                  return dx < 0 && dy < 0 ? Math.max(dx, dy) : Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
                }),
              )
              if (clearance >= 1 && (!best || clearance > best.clearance)) best = { x, y, clearance }
            }
          }
          if (best) placed = textSection(text, height, width, best.x, best.y)
        }
        if (placed) {
          const cut = solidOf(placed.extrude(depth + 0.01))
          cutters.push(solidOf(cut.translate([0, 0, config.height - depth])))
        }
      }
    }
    solid = solidOf(Manifold.difference([solid, ...cutters]))

    const volume = solid.volume()
    const triangles = solid.numTri()
    return { mesh: solid.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}

export function buildHolder(wasm: ManifoldToplevel, config: HolderConfig, font?: Font): HolderBuildResult {
  const plan = holderPlan(config)
  if (plan.modules.length === 0) throw new Error('No requested miniatures fit within the available Gridfinity box')
  const solids: Manifold[] = []
  const previewGap = config.segments <= 256 && plan.modules.length > 1 ? 6 : 0
  const columns = [...new Set(plan.modules.map((module) => module.column))].sort((a, b) => a - b)
  const rows = [...new Set(plan.modules.map((module) => module.row))].sort((a, b) => a - b)
  const previewShift = (value: number, positions: number[]) => (positions.indexOf(value) - (positions.length - 1) / 2) * previewGap
  try {
    for (const module of plan.modules) {
      const built = buildSingleHolder(wasm, module.config, font)
      const solid = new wasm.Manifold(built.mesh)
      solids.push(solid)
      const offsetX = (module.column + module.layout.unitsWide / 2 - plan.unitsWide / 2) * GRID
      const offsetY = (module.row + module.layout.unitsDeep / 2 - plan.unitsDeep / 2) * GRID
      const placed = solid.translate([offsetX + previewShift(module.column, columns), offsetY + previewShift(module.row, rows), 0])
      solids.push(placed)
    }
    const combined = wasm.Manifold.union(solids.filter((_, index) => index % 2 === 1))
    solids.push(combined)
    const volume = combined.volume()
    const triangles = combined.numTri()
    return { mesh: combined.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const solid of solids) solid.delete()
  }
}
