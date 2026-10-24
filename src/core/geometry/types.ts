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
  /** Edge-to-edge distance between slot recesses. */
  spacing: number
  /** Minimum distance from a slot recess to the holder edge. */
  edgeSpacing: number
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

export type PaintingHandleShape = 'round' | 'oval' | 'flared' | 'pistol'

export interface PaintingHandleSettings {
  shape: PaintingHandleShape
  length: number
  width: number
  angle: number
  roundedEnd: boolean
  ribs: boolean
}

export interface PaintingTrayConfig {
  kind: 'painting-tray'
  columns: number
  rows: number
  /** Centre-to-centre distance between magnet pockets. */
  spacing: number
  /** Distance from an outer magnet centre to the tray edge. */
  edgeMargin: number
  height: number
  magnets: HolderConfig['magnets']
  handle: PaintingHandleSettings
  segments: number
  /** Export-only: omit the detachable handle from the assembled preview mesh. */
  assembly?: boolean
}

export type MovementTrayShape = 'round' | 'rect'

export interface MovementTrayConfig {
  kind: 'movement-tray'
  shape: MovementTrayShape
  /** Base footprint across the frontage. The diameter for round. */
  width: number
  /** Base footprint front to back. Ignored by round. */
  length: number
  cornerRadius: number
  columns: number
  ranks: number
  /** Added to each base footprint so a unit drops in without binding. */
  slotClearance: number
  slotDepth: number
  /** Material between the slot floor and the table, which the magnet pockets cut into. */
  floorThickness: number
  /** Wall left around the recess. */
  rim: number
  magnets: HolderConfig['magnets']
  magnetCounts: Record<string, number>
  baseWallThickness: number
  magnetBossWall: number
  segments: number
}

export interface PaintRackItem {
  id: string
  /** A corner turns the rack a quarter round an inside corner, with the back rows against both walls. */
  kind: 'module' | 'corner'
  /** Ignored by a corner, whose size follows the rows. */
  columns: number
}

export interface PaintRackConfig {
  kind: 'paint-rack'
  /**
   * Pieces left to right as seen from the front. A rack grows from either end over time, so a piece never changes
   * when another is added beside it.
   */
  items: PaintRackItem[]
  /** Rows of every piece; corners join runs of the same depth. */
  rows: number
  /** Wings that add bottle cells at the rack's open ends, so each side steps back with the rows. */
  leftEnd: boolean
  rightEnd: boolean
  /** Centre-to-centre distance across a row, which is also each cell's flat-to-flat size. */
  pitch: number
  /** Height gained by each row behind the front one. */
  rise: number
  /** Height of the front row's deck, below its pot pocket. */
  frontHeight: number
  /** Bore through each cell's deck that locates a dropper bottle; wider pots stand on the deck. */
  seatDiameter: number
  /** Depth of the bore, down to where its ledge meets the bore wall. */
  seatDepth: number
  /** Hole through the ledge, smaller than any bottle so it can push one out. */
  holeDiameter: number
  /** Round pocket above each deck that holds a wide pot. Zero leaves a flat deck that pots stand on. */
  pocketDiameter: number
  pocketDepth: number
  wall: number
  /**
   * Holes in a corner's leftover cells. Each is a tube standing on the table, so it must clear the widest part of a
   * handle that goes in, such as the triangular grip on Army Painter brushes.
   */
  brushDiameter: number
  segments: number
  /** Export-only: build this piece of the loadout on its own instead of the whole assembly. */
  piece?: number
}

export interface PaintingHandleConfig {
  kind: 'painting-handle'
  handle: PaintingHandleSettings
  segments: number
}

export interface FlightStemConfig {
  kind: 'stem'
  /** Height of the tapered body, excluding the miniature connection. */
  bodyHeight: number
  bodyDiameter: number
  connection: 'peg' | 'ball'
  modelPegDiameter: number
  modelPegLength: number
  ballDiameter: number
  segments: number
}

export interface TokenImage {
  /** The uploaded file's name, used for the export name when the token has no text. */
  name: string
  width: number
  height: number
  /** Base64, one byte per pixel from the top row down, composited over white. */
  luminance: string
}

/** Hexes sit with a flat edge at the top and bottom, which gives text the widest band through the middle. */
export type TokenShape = 'round' | 'square' | 'hex'

export interface TokenConfig {
  kind: 'token'
  shape: TokenShape
  /** Measured across the flats: the diameter of a round, the side of a square, flat to flat on a hex. */
  size: number
  /** Corner rounding for square. */
  cornerRadius: number
  /** Disc thickness, excluding the raised artwork. */
  thickness: number
  /** Treatment on the top edge; the table face stays full size. */
  profile: EdgeProfile
  profileSize: number
  text: string
  /** Requested cap height, shrunk to fit the flat top face. */
  textHeight: number
  image: TokenImage | null
  /** Luminance, from 0 to 1, below which pixels form the image silhouette. */
  threshold: number
  /** Use the light parts of the image instead of the dark ones. */
  invert: boolean
  /** Positive raises the artwork; negative engraves it into the body. */
  emboss: number
  segments: number
}

export interface BasePartConfig extends BaseConfig {
  kind?: 'base'
}

export type PartConfig =
  | BasePartConfig
  | HolderConfig
  | MovementTrayConfig
  | PaintingTrayConfig
  | PaintRackConfig
  | FlightStemConfig
  | TokenConfig
export type BuildConfig = PartConfig | PaintingHandleConfig
