/** Footprints that cover the tabletop range; all are convex, which the body loft relies on. */
export type ShapeKind = 'round' | 'oval' | 'pill' | 'rect' | 'polygon'

/** Edge treatment applied where the wall meets the table-contact bottom. */
export type EdgeProfile = 'taper' | 'straight' | 'bevel' | 'round'

/** Where the magnets go in from, which also decides whether the top is recessed. */
export type Underside = 'well' | 'solid'

export interface MagnetSpec {
  /** 0 disables pockets. 1 sits at the centre, more spread over the footprint. */
  count: number
  diameter: number
  /** Added to the diameter so a nominal magnet actually drops in. */
  clearance: number
  /** Wall left around each pocket, forming the boss that carries it. */
  bossWall: number
  /** Pocket depth for solid bases, where the pocket opens at the bottom face. */
  depth: number
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
  underside: Underside
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
