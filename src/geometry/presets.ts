import { magnetsRing } from './base'
import { isElongated } from './outline'
import { previewSegmentsFor } from './quality'
import type { BaseConfig, MagnetPatternVersion, ShapeKind } from './types'

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
  { label: '80', shape: 'round', width: 80, use: 'Large vehicles, monsters' },
  { label: '90', shape: 'round', width: 90, use: 'Greater daemons, big characters' },
  { label: '100', shape: 'round', width: 100, use: 'Very large monsters' },
  { label: '130', shape: 'round', width: 130, use: 'Titanic monsters' },
  { label: '160', shape: 'round', width: 160, use: 'The largest round GW makes' },
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
 * Roughly one magnet per this much of the line they are spread along, in mm.
 * Read off what the 60mm and 80mm sizes already did at three and four magnets,
 * which are the sizes people have the most experience of.
 */
const MAGNET_PITCH = 31

/** An end pair covers this many pitches before a longer row needs inner magnets for added holding force. */
const END_PAIR_PITCHES = 3

/** A central magnet is only stable while no axis runs farther than this. */
const SINGLE_MAGNET_MAX_SPAN = MAGNET_PITCH * 2

const RING_COUNTS = [3, 4, 5, 6, 8]
const ROW_COUNTS = [4, 6, 8]
const ROW_LIMIT_COUNTS = [1, 2, ...ROW_COUNTS]
const DEFAULT_MAGNET_STRENGTH = 5 ** 2 * 2

/** Every count the pickers offer, including ones no preset picks by itself. */
export const MAGNET_CHOICES = [0, 1, 2, 3, 4, 5, 6, 8]
export const RIB_CHOICES = [0, 2, 3, 4, 5, 6, 8]

function spreadCount(ideal: number, counts: number[]): number {
  return counts.reduce((best, count) => (count <= ideal ? count : best), counts[0])
}

function ringMagnetCount(short: number): number {
  const ideal = (Math.PI * short) / 2 / MAGNET_PITCH
  return spreadCount(ideal, RING_COUNTS)
}

/**
 * One central magnet holds anything up to a 40mm footprint. Past that magnets
 * spread out to resist tipping, and the count grows with the footprint because
 * larger bases usually carry heavier models.
 */
function legacyMagnetCount(width: number, length: number, maxCount: number): number {
  const short = Math.min(width, length)
  const long = Math.max(width, length)
  if (short < 20) return 0
  if (width * length <= 40 * 40 && long <= SINGLE_MAGNET_MAX_SPAN) return 1

  if (magnetsRing(width, length)) {
    // Ring magnets sit a quarter of the short side out from the centre.
    return Math.min(ringMagnetCount(short), maxCount)
  }
  // A row runs the long axis, stopping a boss-width short of each end.
  const run = long - 8
  const transverseCount = ringMagnetCount(short)
  if (run <= MAGNET_PITCH * END_PAIR_PITCHES && short <= SINGLE_MAGNET_MAX_SPAN && transverseCount === 3) return Math.min(2, maxCount)
  const transverseMinimum = transverseCount % 2 === 0 ? transverseCount : transverseCount - 1
  const natural = Math.max(transverseMinimum, spreadCount(run / MAGNET_PITCH + 1, ROW_COUNTS))
  return spreadCount(Math.min(natural, maxCount), ROW_LIMIT_COUNTS)
}

function nextSupportedCount(ideal: number, counts: number[], maxCount: number): number {
  const available = counts.filter((count) => count <= maxCount)
  return available.find((count) => count >= ideal) ?? available.at(-1) ?? 0
}

export function automaticMagnetCount(width: number, length: number, maxCount: number, diameter: number, thickness: number): number {
  const baseline = legacyMagnetCount(width, length, maxCount)
  if (baseline <= 1) return baseline
  const strength = diameter ** 2 * thickness
  const forceDemand = Math.ceil((baseline * DEFAULT_MAGNET_STRENGTH) / strength)
  if (magnetsRing(width, length)) return nextSupportedCount(Math.max(3, forceDemand), RING_COUNTS, maxCount)
  return nextSupportedCount(Math.max(2, forceDemand), ROW_LIMIT_COUNTS, maxCount)
}

/**
 * Every magnet boss ends up on a spoke, which gussets its root, prints as one
 * connected feature rather than an island, and collects the clear floor into a
 * few wide gaps instead of twice as many narrow ones.
 *
 * A ring gets one spoke each. A row is easier than it looks: every magnet in it
 * shares the long axis, so a single spoke down that axis passes through all of
 * them — so long as the count is even, which also gives the short axis a pair.
 * With no ring and no row there is nothing to line up with and the count just
 * follows the span.
 */
export function ribCountFor(width: number, length: number, magnets: number): number {
  const short = Math.min(width, length)

  if (magnets >= 2) {
    if (magnetsRing(width, length)) return magnets
    return short <= 45 ? 4 : 6
  }
  if (short <= 28.5) return 2
  if (short <= 34) return 3
  return 4
}

/** Keeps the number readable on a 25mm base without dominating a 100mm one. */
function labelHeight(width: number, length: number): number {
  return Math.min(8, Math.max(3.5, Math.min(width, length) * 0.2))
}

/** Larger spans need a little more skin to resist flex when pressed. */
export function defaultFloorThickness(width: number, length: number): number {
  return Math.min(width, length) >= 65 ? 1.5 : 1
}

export function defaultBaseHeight(width: number, length: number): number {
  return 3 + defaultFloorThickness(width, length)
}

/**
 * Defaults follow the Games Workshop look: full size at the top face, a 1mm taper
 * at the rim, and 3mm of recess for the magnets. Bases 65mm and over use a
 * 1.5mm floor to resist flex; smaller bases keep the 1mm floor.
 */
export function presetFor(preset: SizePreset, maxMagnets = 8, patternVersion: MagnetPatternVersion = 2): BaseConfig {
  const width = preset.width
  const length = preset.length ?? preset.width
  const floor = defaultFloorThickness(width, length)
  const magnetCount =
    patternVersion === 1 ? legacyMagnetCount(width, length, maxMagnets) : automaticMagnetCount(width, length, maxMagnets, 5, 2)
  return {
    shape: preset.shape,
    width,
    length,
    cornerRadius: Math.min(2, Math.min(width, length) * 0.06),
    sides: 6,
    height: defaultBaseHeight(width, length),
    profile: 'taper',
    profileSize: 1,
    wallThickness: 2,
    floorThickness: floor,
    magnets: {
      count: magnetCount,
      layout: 'balanced',
      patternVersion,
      maxCount: maxMagnets,
      latticePitch: 30,
      diameter: 5,
      clearance: 0.2,
      depthClearance: 0.1,
      bossWall: 0.9,
      thickness: 2,
    },
    // Low ribs stiffen the thin floor the recess leaves, without filling the recess.
    ribs: { count: ribCountFor(width, length, magnetCount), thickness: 1.6, height: 1.2 },
    label: { enabled: true, height: labelHeight(width, length), emboss: 0.6 },
    segments: previewSegmentsFor(Math.max(width, length)),
  }
}

/** Re-derives the size-driven defaults after the footprint is changed by hand. */
export function resized(config: BaseConfig, width: number, length: number): BaseConfig {
  const effective = isElongated(config.shape) ? length : width
  const oldFloor = defaultFloorThickness(config.width, config.length)
  const floor = config.floorThickness === oldFloor ? defaultFloorThickness(width, effective) : config.floorThickness
  const height = config.height === defaultBaseHeight(config.width, config.length) ? defaultBaseHeight(width, effective) : config.height
  const magnetCount =
    config.magnets.patternVersion === 1
      ? legacyMagnetCount(width, effective, config.magnets.maxCount)
      : automaticMagnetCount(width, effective, config.magnets.maxCount, config.magnets.diameter, config.magnets.thickness)
  return {
    ...config,
    width,
    length: effective,
    height,
    floorThickness: floor,
    magnets: { ...config.magnets, count: magnetCount },
    ribs: { ...config.ribs, count: ribCountFor(width, effective, magnetCount) },
    label: { ...config.label, height: labelHeight(width, effective) },
    segments: previewSegmentsFor(Math.max(width, effective)),
  }
}

export const DEFAULT_PRESET = ROUND_SIZES[2]

export function footprintKey(shape: ShapeKind, width: number, length: number): string {
  return `${shape}:${width}x${isElongated(shape) ? length : width}`
}
