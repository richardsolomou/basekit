import { isElongated } from './outline'
import type { BaseConfig, ShapeKind } from './types'

export interface SizePreset {
  label: string
  shape: ShapeKind
  width: number
  length?: number
  /** What the size is normally used for, shown as a hint in the picker. */
  use: string
}

/**
 * The Games Workshop range as actually moulded — note 28.5mm, which everyone calls
 * 28mm — plus the oval sizes used from bikes up to titans.
 */
export const ROUND_SIZES: SizePreset[] = [
  { label: '25', shape: 'round', width: 25, use: 'Legacy infantry, grots' },
  { label: '28.5', shape: 'round', width: 28.5, use: 'Older marines, guardsmen' },
  { label: '32', shape: 'round', width: 32, use: 'Current infantry' },
  { label: '40', shape: 'round', width: 40, use: 'Terminators, heavy infantry' },
  { label: '50', shape: 'round', width: 50, use: 'Bikes, ogryns' },
  { label: '60', shape: 'round', width: 60, use: 'Dreadnoughts' },
  { label: '65', shape: 'round', width: 65, use: 'Large monsters' },
  { label: '80', shape: 'round', width: 80, use: 'Riptides, greater daemons' },
  { label: '100', shape: 'round', width: 100, use: 'Very large monsters' },
  { label: '130', shape: 'round', width: 130, use: 'Titanic monsters' },
]

export const OVAL_SIZES: SizePreset[] = [
  { label: '60×35', shape: 'oval', width: 60, length: 35, use: 'Bikes, jetbikes' },
  { label: '75×42', shape: 'oval', width: 75, length: 42, use: 'Cavalry, bloat drones' },
  { label: '90×52', shape: 'oval', width: 90, length: 52, use: 'Monsters, war walkers' },
  { label: '105×70', shape: 'oval', width: 105, length: 70, use: 'Large vehicles' },
  { label: '120×92', shape: 'oval', width: 120, length: 92, use: 'Knights, gargantuans' },
  { label: '170×105', shape: 'oval', width: 170, length: 105, use: 'Titans' },
]

/** Rank-and-flank sizes: The Old World, Kings of War and most historical ranges. */
export const RECT_SIZES: SizePreset[] = [
  { label: '20×20', shape: 'rect', width: 20, length: 20, use: 'Rank infantry' },
  { label: '25×25', shape: 'rect', width: 25, length: 25, use: 'Old World infantry' },
  { label: '20×40', shape: 'rect', width: 20, length: 40, use: 'Kings of War cavalry' },
  { label: '25×50', shape: 'rect', width: 25, length: 50, use: 'Cavalry, knights' },
  { label: '40×40', shape: 'rect', width: 40, length: 40, use: 'Monstrous infantry, ogres' },
  { label: '50×50', shape: 'rect', width: 50, length: 50, use: 'Monsters, war engines' },
  { label: '50×100', shape: 'rect', width: 50, length: 100, use: 'Chariots, large monsters' },
  { label: '60×100', shape: 'rect', width: 60, length: 100, use: 'Very large monsters' },
]

/** A pill is a squared-off oval, so it takes the same footprints. */
export const PILL_SIZES: SizePreset[] = [
  { label: '60×35', shape: 'pill', width: 60, length: 35, use: 'Bikes, cavalry' },
  { label: '75×42', shape: 'pill', width: 75, length: 42, use: 'Large cavalry' },
  { label: '90×52', shape: 'pill', width: 90, length: 52, use: 'Monsters' },
  { label: '105×70', shape: 'pill', width: 105, length: 70, use: 'Large vehicles' },
]

/** Measured across the corners, so a hex drops into the same space as that round. */
export const POLYGON_SIZES: SizePreset[] = [
  { label: '25', shape: 'polygon', width: 25, use: 'Fits a Ø25 round' },
  { label: '32', shape: 'polygon', width: 32, use: 'Fits a Ø32 round' },
  { label: '40', shape: 'polygon', width: 40, use: 'Fits a Ø40 round' },
  { label: '50', shape: 'polygon', width: 50, use: 'Fits a Ø50 round' },
  { label: '60', shape: 'polygon', width: 60, use: 'Fits a Ø60 round' },
]

export const SIZES_BY_SHAPE: Record<ShapeKind, SizePreset[]> = {
  round: ROUND_SIZES,
  oval: OVAL_SIZES,
  pill: PILL_SIZES,
  rect: RECT_SIZES,
  polygon: POLYGON_SIZES,
}

/** Where each shape starts, chosen to show what the shape is for. */
export const DEFAULT_SIZE: Record<ShapeKind, SizePreset> = {
  round: ROUND_SIZES[2], // 32
  oval: OVAL_SIZES[0], // 60x35
  pill: PILL_SIZES[0], // 60x35
  rect: RECT_SIZES[3], // 25x50
  polygon: POLYGON_SIZES[1], // 32
}

/**
 * One central magnet holds anything up to a 40mm footprint. Past that a single
 * magnet lets the model pivot, so they spread out over the area.
 */
function magnetCount(width: number, length: number): number {
  const area = width * length
  if (Math.min(width, length) < 20) return 0
  if (area <= 40 * 40) return 1
  if (area <= 70 * 70) return 3
  return 4
}

function ribCount(width: number, length: number): number {
  const short = Math.min(width, length)
  if (short <= 28.5) return 2
  if (short <= 34) return 3
  if (short <= 45) return 4
  return 3
}

/** Keeps the number readable on a 25mm base without dominating a 100mm one. */
function labelHeight(width: number, length: number): number {
  return Math.min(8, Math.max(3.5, Math.min(width, length) * 0.2))
}

/** Chord error stays under ~0.02mm at print scale. */
export function segmentsFor(size: number): number {
  return Math.min(256, Math.max(64, Math.ceil(size * 3.2)))
}

/**
 * Defaults follow the Games Workshop look: full size at the top face, a 1mm taper
 * down to the table, 3mm of well for basing material over a 1mm floor.
 */
export function presetFor(preset: SizePreset): BaseConfig {
  const width = preset.width
  const length = preset.length ?? preset.width
  return {
    shape: preset.shape,
    width,
    length,
    cornerRadius: Math.min(2, Math.min(width, length) * 0.06),
    sides: 6,
    height: 4,
    profile: 'taper',
    profileSize: 1,
    underside: 'well',
    wallThickness: 2,
    floorThickness: 1,
    magnets: { count: magnetCount(width, length), diameter: 5, clearance: 0.2, bossWall: 0.9, depth: 2 },
    // Low ribs brace the thin floor without walling the well off from basing material.
    ribs: { count: ribCount(width, length), thickness: 1.6, height: 1.2 },
    label: { enabled: true, height: labelHeight(width, length), emboss: 0.6 },
    segments: segmentsFor(Math.max(width, length)),
  }
}

/** Re-derives the size-driven defaults after the footprint is changed by hand. */
export function resized(config: BaseConfig, width: number, length: number): BaseConfig {
  const effective = isElongated(config.shape) ? length : width
  return {
    ...config,
    width,
    length: effective,
    magnets: { ...config.magnets, count: magnetCount(width, effective) },
    ribs: { ...config.ribs, count: ribCount(width, effective) },
    label: { ...config.label, height: labelHeight(width, effective) },
    segments: segmentsFor(Math.max(width, effective)),
  }
}

export const DEFAULT_PRESET = ROUND_SIZES[2]
