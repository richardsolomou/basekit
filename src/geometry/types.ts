/** Footprints that cover the tabletop range; all are convex, which the body loft relies on. */
export type ShapeKind = 'round' | 'oval' | 'pill' | 'rect' | 'polygon'

/** Edge treatment applied where the wall meets the table-contact bottom. */
export type EdgeProfile = 'taper' | 'straight' | 'bevel' | 'round'

export type MagnetLayout = 'balanced' | 'five-cross'
export type MagnetPatternVersion = 1 | 2

export interface MagnetSpec {
  /** 0 disables pockets. 1 sits at the centre, more spread over the footprint. */
  count: number
  /** Balanced follows the selected count; five-cross provides a centre and four outer pockets. */
  layout: MagnetLayout
  /** Version 1 preserves legacy balanced recommendations; version 2 makes balanced recommendations magnet-aware. */
  patternVersion: MagnetPatternVersion
  /** Upper bound for counts chosen automatically from the footprint. */
  maxCount: number
  diameter: number
  /** Added to the diameter so a nominal magnet actually drops in. */
  clearance: number
  /** Added to the pocket depth for adhesive and Z-axis tolerance. */
  depthClearance: number
  /** Wall left around each pocket, forming the boss that carries it. */
  bossWall: number
  /** Nominal magnet thickness, before depth clearance is added to the pocket. */
  thickness: number
}

export interface RibSpec {
  count: number
  thickness: number
  /** Height above the well floor. */
  height: number
}

export interface LabelSpec {
  enabled: boolean
  /** Defaults to the measured size, so a 28.5mm base reads "28.5". */
  text?: string
  /** Cap height in mm. */
  height: number
  /** Raised height above the well floor. */
  emboss: number
}

export interface BaseConfig {
  shape: ShapeKind
  /** X extent. The diameter for round, the across-corners size for polygons. */
  width: number
  /** Y extent. Ignored by round and polygon, which are driven by width alone. */
  length: number
  /** Corner rounding for rect. */
  cornerRadius: number
  /** Side count for polygon: 3 is a triangle, 6 a hex. */
  sides: number
  height: number
  profile: EdgeProfile
  /** Bevel/taper/round size, measured inwards from the top face. */
  profileSize: number
  wallThickness: number
  /** Material between the well floor and the table. */
  floorThickness: number
  magnets: MagnetSpec
  ribs: RibSpec
  label: LabelSpec
  /** Segments per full circle, so curves stay smooth at print scale. */
  segments: number
}

export interface BaseStats {
  triangles: number
  /** mm³ */
  volume: number
  /** Grams at 1.24 g/cm³ (PLA). */
  grams: number
  /** True when the mesh is a closed solid with substance. */
  solid: boolean
}

export interface HolderConfig {
  kind: 'holder'
  groups: HolderGroup[]
  maxColumns: number
  maxRows: number
  splitGroups: boolean
  engraving: {
    enabled: boolean
    placement: 'slots' | 'module'
  }
  /** Edge-to-edge distance between nominal miniature bases. */
  spacing: number
  /** Added to the diameter so bases lift out without binding. */
  slotClearance: number
  slotDepth: number
  height: number
  magnets: {
    enabled: boolean
    layout: MagnetLayout
    patternVersion: MagnetPatternVersion
    maxCount: number
    diameter: number
    clearance: number
    depthClearance: number
    thickness: number
  }
  magnetCounts: Record<string, number>
  baseWallThickness: number
  magnetBossWall: number
  segments: number
}

export interface HolderGroup {
  id: string
  quantity: number
  shape: ShapeKind
  width: number
  length: number
  cornerRadius: number
  sides: number
}

export interface TierConfig {
  kind: 'tier'
  columns: number
  rows: number
  /** Clear space from the build plate to the underside of the deck. */
  clearance: number
  deckThickness: number
  pillarSize: number
  segments: number
}

export interface BasePartConfig extends BaseConfig {
  kind?: 'base'
}

export type PartConfig = BasePartConfig | HolderConfig | TierConfig
