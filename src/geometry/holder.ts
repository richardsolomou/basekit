import type { CrossSection, Manifold, ManifoldToplevel, Mesh, Vec3 } from 'manifold-3d'
import type { Font } from 'opentype.js'
import { trimNumber } from './outline'
import { curveTolerance, segmentsForTolerance } from './quality'
import { polygonsWidth, textPolygons, type Polygon } from './text'
import type { BaseStats, HolderConfig } from './types'

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

export interface HolderLayout {
  unitsWide: number
  unitsDeep: number
  width: number
  length: number
  slotCenters: { x: number; y: number; diameter: number }[]
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
  omitted: { id: string; quantity: number; diameter: number }[]
  unitsWide: number
  unitsDeep: number
}

function distributed(points: { x: number; y: number; diameter: number }[], width: number, length: number) {
  const minX = Math.min(...points.map((point) => point.x - point.diameter / 2))
  const maxX = Math.max(...points.map((point) => point.x + point.diameter / 2))
  const minY = Math.min(...points.map((point) => point.y - point.diameter / 2))
  const maxY = Math.max(...points.map((point) => point.y + point.diameter / 2))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const centred = points.map((point) => ({ ...point, x: point.x - cx, y: point.y - cy }))
  let scale = Infinity
  for (const point of centred) {
    const radius = point.diameter / 2
    if (Math.abs(point.x) > 1e-9) scale = Math.min(scale, (width / 2 - radius) / Math.abs(point.x))
    if (Math.abs(point.y) > 1e-9) scale = Math.min(scale, (length / 2 - radius) / Math.abs(point.y))
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

const layoutCache = new Map<string, HolderLayout>()

function singleHolderLayout(config: Pick<HolderConfig, 'groups' | 'maxColumns' | 'maxRows' | 'spacing'>): HolderLayout {
  const maxColumns = Math.max(1, Math.round(config.maxColumns))
  const maxRows = Math.max(1, Math.round(config.maxRows))
  const groups = config.groups
    .filter((group) => group.quantity > 0)
    .map((group) => ({ quantity: Math.round(group.quantity), diameter: group.diameter }))
  const diameters = groups.flatMap((group) => Array.from({ length: group.quantity }, () => group.diameter)).sort((a, b) => b - a)
  const key = `${maxColumns}:${maxRows}:${config.spacing}:${groups.map((group) => `${group.quantity}x${group.diameter}`).join(',')}`
  const cached = layoutCache.get(key)
  if (cached) return cached
  const largest = diameters[0] ?? 0
  const minimumColumns = Math.max(1, Math.ceil((largest + GAP) / GRID))
  let layout: HolderLayout | undefined
  for (let unitsWide = minimumColumns; unitsWide <= maxColumns && !layout; unitsWide++) {
    const width = unitsWide * GRID - GAP
    for (let unitsDeep = 1; unitsDeep <= maxRows; unitsDeep++) {
      const length = unitsDeep * GRID - GAP
      if (diameters.some((diameter) => diameter > width || diameter > length)) continue
      const packed = relaxedPacking(diameters, width, length, config.spacing)
      if (packed) {
        layout = { unitsWide, unitsDeep, width, length, slotCenters: distributed(packed, width, length) }
        break
      }
    }
  }
  layout ??= { unitsWide: maxColumns, unitsDeep: maxRows, width: maxColumns * GRID - GAP, length: maxRows * GRID - GAP, slotCenters: [] }
  layoutCache.set(key, layout)
  return layout
}

const planCache = new Map<string, HolderPlan>()

export function holderPlan(config: HolderConfig): HolderPlan {
  const columns = Math.max(1, Math.round(config.maxColumns))
  const rows = Math.max(1, Math.round(config.maxRows))
  const key = JSON.stringify(config)
  const cached = planCache.get(key)
  if (cached) return cached

  if (!config.splitGroups) {
    const groups = config.groups.map((group) => ({ ...group, quantity: Math.max(0, Math.round(group.quantity)) }))
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
    planCache.set(key, plan)
    return plan
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
    let remaining = Math.max(0, Math.round(group.quantity))
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
        omitted.push({ ...group, quantity: remaining })
        break
      }
    }
  }

  const unitsWide = Math.max(1, ...modules.map((module) => module.column + module.layout.unitsWide))
  const unitsDeep = Math.max(1, ...modules.map((module) => module.row + module.layout.unitsDeep))
  const plan = { modules, omitted, unitsWide, unitsDeep }
  planCache.set(key, plan)
  return plan
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
    groups: [{ id: 'models-1', quantity: 5, diameter: 32 }],
    maxColumns: 7,
    maxRows: 5,
    splitGroups: true,
    engraving: { enabled: true, placement: 'slots' },
    spacing: 0.5,
    slotClearance: 0.5,
    slotDepth: 3,
    height: 14,
    magnets: { enabled: true, diameter: 5, clearance: 0.2, thickness: 2 },
    segments: 160,
  }
}

export function holderName(config: HolderConfig): string {
  const layout = holderLayout(config)
  const models = config.groups.map((group) => `${group.quantity}x${group.diameter}`).join('-')
  return `holder-gridfinity-${layout.unitsWide}x${layout.unitsDeep}-${models}mm`
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
    const requiredFloor = config.magnets.enabled ? config.magnets.thickness + 0.4 : 0.4
    if (config.slotDepth > config.height - requiredFloor) throw new Error('Slots leave too little material under the magnet pockets')

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

    const slotOutlines = layout.slotCenters.map((center) => {
      const diameter = center.diameter + config.slotClearance
      return section(CrossSection.circle(diameter / 2, segmentsFor(diameter, 64)).translate([center.x, center.y]))
    })
    const slots = section(CrossSection.union(slotOutlines))
    const slotCut = solidOf(slots.extrude(config.slotDepth + 0.01))
    const cutters = [solidOf(slotCut.translate([0, 0, config.height - config.slotDepth]))]

    if (config.magnets.enabled) {
      const radius = (config.magnets.diameter + config.magnets.clearance) / 2
      const magnetDisc = section(CrossSection.circle(radius, segmentsFor(radius * 2, 32)))
      const magnetOutlines = layout.slotCenters.map((center) => section(magnetDisc.translate([center.x, center.y])))
      const magnets = section(CrossSection.union(magnetOutlines))
      const drill = solidOf(magnets.extrude(config.magnets.thickness + 0.001))
      const pocketFloor = config.height - config.slotDepth - config.magnets.thickness
      cutters.push(solidOf(drill.translate([0, 0, pocketFloor])))
    }

    if (config.engraving.enabled && font) {
      const depth = 0.4
      const textSection = (text: string, height: number, maxWidth: number, x: number, y: number) => {
        const polygons = textPolygons(font, text, height)
        const width = polygonsWidth(polygons)
        const scale = width > maxWidth ? maxWidth / width : 1
        const scaled: Polygon[] = polygons.map((polygon) => polygon.map(([px, py]): [number, number] => [px * scale + x, py * scale + y]))
        return section(CrossSection.ofPolygons(scaled, 'EvenOdd'))
      }

      if (config.engraving.placement === 'slots') {
        const labels: CrossSection[] = []
        for (const diameter of new Set(layout.slotCenters.map((center) => center.diameter))) {
          const height = Math.min(4, diameter * 0.14)
          const glyph = textSection(trimNumber(diameter), height, diameter * 0.55, 0, diameter * 0.24)
          for (const center of layout.slotCenters.filter((slot) => slot.diameter === diameter)) {
            labels.push(section(glyph.translate([center.x, center.y])))
          }
        }
        const outlines = section(CrossSection.union(labels))
        const cut = solidOf(outlines.extrude(depth + 0.01))
        cutters.push(solidOf(cut.translate([0, 0, config.height - config.slotDepth - depth])))
      } else {
        const text = [...new Set(config.groups.map((group) => trimNumber(group.diameter)))].join(' / ')
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
                  const dx = Math.max(Math.abs(slot.x - x) - halfWidth, 0)
                  const dy = Math.max(Math.abs(slot.y - y) - halfHeight, 0)
                  return Math.hypot(dx, dy) - (slot.diameter + config.slotClearance) / 2
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
