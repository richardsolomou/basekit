import type { CrossSection, Manifold, ManifoldToplevel, Mesh, Vec3 } from 'manifold-3d'
import type { Font } from 'opentype.js'
import { fitLabel, LABEL_MARGIN, labelAngles, pointInContours, type LabelCircle } from './label'
import { baseOutline, defaultLabel } from './outline'
import { MIN_PROFILE_WALL, profileInsetAt, profileSteps } from './profile'
import { curveTolerance } from './quality'
import { polygonsWidth, textPolygons, type Polygon } from './text'
import type { BaseConfig, BaseStats, MagnetLayout, ShapeKind } from './types'

export interface BuildResult {
  mesh: Mesh
  stats: BaseStats
}

const PLA_DENSITY = 1.24e-3 // g/mm³
/** Beyond this width-to-length ratio, magnets line up along the long axis instead of on a ring. */
const ELONGATED_RATIO = 1.35

export interface Circle {
  x: number
  y: number
  r: number
}

interface MagnetPositionOptions {
  ellipticalRow?: boolean
  layout?: MagnetLayout
  latticePitch?: number
}

const latticePoint = (column: number, row: number, pitch: number): Circle => ({
  x: (column + row / 2) * pitch,
  y: row * pitch * (Math.sqrt(3) / 2),
  r: 0,
})

function latticeMagnetPositions(count: number, halfWidth: number, halfLength: number, clear: number, pitch: number): Circle[] {
  const elongated = !magnetsRing(halfWidth, halfLength)
  let points: Circle[]
  if (elongated) {
    const pairs = Math.floor(count / 2)
    const alongX = halfWidth >= halfLength
    points = count % 2 === 1 ? [{ x: 0, y: 0, r: 0 }] : []
    for (let level = 1; level <= pairs; level++) {
      points.push(
        { x: alongX ? -level * pitch : 0, y: alongX ? 0 : -level * pitch, r: 0 },
        { x: alongX ? level * pitch : 0, y: alongX ? 0 : level * pitch, r: 0 },
      )
    }
  } else {
    const hex = [
      latticePoint(1, 0, pitch),
      latticePoint(0, 1, pitch),
      latticePoint(-1, 1, pitch),
      latticePoint(-1, 0, pitch),
      latticePoint(0, -1, pitch),
      latticePoint(1, -1, pitch),
    ]
    const cross = [latticePoint(1, 0, pitch), latticePoint(-1, 0, pitch), latticePoint(-1, 2, pitch), latticePoint(1, -2, pitch)]
    if (count === 1) points = [{ x: 0, y: 0, r: 0 }]
    else if (count === 2) points = [hex[0], hex[3]]
    else if (count === 3) points = [hex[0], hex[2], hex[4]]
    else if (count === 4) points = cross
    else if (count === 5) points = [{ x: 0, y: 0, r: 0 }, ...cross]
    else if (count === 6) points = hex
    else if (count === 8) points = [...hex, latticePoint(2, 0, pitch), latticePoint(-2, 0, pitch)]
    else throw new Error(`The tray-compatible layout does not support ${count} magnets`)
  }
  if (points.some(({ x, y }) => Math.abs(x) > halfWidth - clear + 1e-6 || Math.abs(y) > halfLength - clear + 1e-6)) {
    throw new Error('Tray-compatible magnet pitch is too wide for this base and magnet count')
  }
  return points
}

export function trayCompatibleMagnetCounts(config: BaseConfig): number[] {
  const halfWidth = Math.max(0, config.width / 2 - config.wallThickness)
  const halfLength = Math.max(0, config.length / 2 - config.wallThickness)
  const clear = (config.magnets.diameter + config.magnets.clearance) / 2 + config.magnets.bossWall + LABEL_MARGIN
  return [0, 1, 2, 3, 4, 5, 6, 8].filter((count) => {
    if (count === 0) return true
    try {
      latticeMagnetPositions(count, halfWidth, halfLength, clear, config.magnets.latticePitch)
      return true
    } catch {
      return false
    }
  })
}

/** Whether magnets sit on a ring, rather than in a row down the long axis. */
export function magnetsRing(width: number, length: number): boolean {
  return Math.max(width, length) / Math.min(width, length) <= ELONGATED_RATIO
}

export function supportsFivePocketCross(shape: ShapeKind, width: number): boolean {
  return shape === 'round' && width >= 50
}

/**
 * Magnet centres. Round-ish footprints get a ring so the pull is even; long ones
 * get a row down the major axis, which is where the material actually is.
 */
export function magnetPositions(
  count: number,
  halfWidth: number,
  halfLength: number,
  clear: number,
  options: MagnetPositionOptions = {},
): Circle[] {
  if (count <= 0) return []
  if (options.layout === 'lattice') {
    return latticeMagnetPositions(count, halfWidth, halfLength, clear, options.latticePitch ?? 15)
  }
  if (options.layout === 'five-cross') {
    return [{ x: 0, y: 0, r: 0 }, ...magnetPositions(4, halfWidth, halfLength, clear, { ...options, layout: 'balanced' })]
  }
  if (count === 1) return [{ x: 0, y: 0, r: 0 }]

  const long = Math.max(halfWidth, halfLength)
  const short = Math.min(halfWidth, halfLength)
  if (!magnetsRing(halfWidth, halfLength)) {
    const ellipseReach = long * Math.sqrt(Math.max(0, 1 - (clear / short) ** 2)) - clear
    const reach = Math.max(options.ellipticalRow ? ellipseReach : long - clear, 0)
    const alongX = halfWidth >= halfLength
    return Array.from({ length: count }, (_, i) => {
      const t = (2 * i) / (count - 1) - 1
      return { x: alongX ? t * reach : 0, y: alongX ? 0 : t * reach, r: 0 }
    })
  }

  const radius = Math.max(Math.min(short * 0.5, short - clear), 0)
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI / 2 + (2 * Math.PI * i) / count
    return { x: radius * Math.cos(a), y: radius * Math.sin(a), r: radius }
  })
}

const TAU = 2 * Math.PI
/** Shortest angle between two bearings, ignoring which way round. */
function angleBetween(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

/**
 * Rib bearings, phased to run through as many bosses as the counts allow.
 *
 * A rib and a boss on the same bearing merge into one connected feature, which
 * is worth more than it looks: the boss gets a gusset at its root, where the
 * bending moment from a magnet being peeled off a tray is highest; the slicer
 * gets one connected perimeter network per layer instead of isolated islands;
 * and the clear floor collects into a few wide gaps rather than twice as many
 * narrow ones, which is what lets the size label stay large.
 *
 * Supporting the span *between* bosses would be the alternative, but a boss is a
 * 7mm inclusion in a plate tens of millimetres across — it barely supports the
 * membrane around it, so the phase makes almost no difference to floor
 * stiffness either way. That leaves the reasons above, and they all point one
 * direction.
 *
 * Counts that share no factor cannot all line up: three ribs against four
 * bosses can only ever hit one. Phases are drawn from the boss bearings
 * themselves so the alignment is exact rather than nearly, and the one that
 * lands closest to the rest wins. A single central magnet has no bearing at
 * all, and every rib meets it at the centre regardless.
 */
export function ribAngles(count: number, magnets: Circle[], followMagnets = false): number[] {
  if (count <= 0) return []
  const spacing = TAU / count
  const spokes = (phase: number) => Array.from({ length: count }, (_, i) => phase + spacing * i)

  const bosses = magnets.filter((m) => Math.hypot(m.x, m.y) > 1e-6).map((m) => Math.atan2(m.y, m.x))
  if (bosses.length === 0) return spokes(Math.PI / 2)
  if (followMagnets) {
    const result = bosses.filter((bearing, index) => bosses.findIndex((candidate) => angleBetween(candidate, bearing) < 1e-6) === index)
    for (const candidate of spokes(Math.PI / 2)) {
      if (result.length >= count) break
      if (result.every((bearing) => angleBetween(bearing, candidate) > 1e-6)) result.push(candidate)
    }
    return result.slice(0, count)
  }

  let best = bosses[0]
  let closest = Infinity
  for (const phase of bosses) {
    const arranged = spokes(phase)
    const missed = bosses.reduce((total, boss) => total + Math.min(...arranged.map((s) => angleBetween(s, boss))), 0)
    if (missed < closest) {
      closest = missed
      best = phase
    }
  }
  return spokes(best)
}

/** Approximates each rib spoke as overlapping discs, so label fitting only sees circles. */
function ribObstacles(angles: number[], length: number, thickness: number): LabelCircle[] {
  if (!Number.isFinite(length) || length <= 0) return []
  const step = Math.max(0.4, thickness / 2)
  return angles.flatMap((a) => {
    const discs: Circle[] = []
    for (let r = 0; r <= length; r += step) discs.push({ x: r * Math.cos(a), y: r * Math.sin(a), r: thickness / 2 })
    return discs
  })
}

export function buildBase(wasm: ManifoldToplevel, config: BaseConfig, font?: Font): BuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []

  /** Hands every intermediate to the disposal list; WASM memory is not GC'd. */
  const own = <T extends { delete: () => void }>(o: T): T => {
    trash.push(o)
    return o
  }
  const section = (cs: CrossSection) => own(cs)
  const solidOf = (m: Manifold) => own(m)

  try {
    const wellDepth = config.height - config.floorThickness
    if (wellDepth < 0.2) throw new Error('No room left for a well — thin the floor')
    const tolerance = curveTolerance(Math.max(config.width, config.length), config.segments)
    const wallAtFloor =
      config.wallThickness - profileInsetAt(config.height, config.profile, config.profileSize, config.floorThickness, tolerance)
    if (wallAtFloor < MIN_PROFILE_WALL - 1e-6) {
      throw new Error('Edge profile leaves too little wall at the well floor — reduce the edge size')
    }

    const outline = section(baseOutline(wasm, config))

    // Loft the body as the convex hull of the outline offset at each profile height.
    // Every supported footprint is convex, so the hull is exactly the intended solid.
    const points: Vec3[] = []
    for (const step of profileSteps(config.height, config.profile, config.profileSize, tolerance)) {
      const ring = step.inset > 0 ? section(outline.offset(-step.inset, 'Miter', 2, config.segments)) : outline
      for (const contour of ring.toPolygons()) {
        for (const [x, y] of contour) points.push([x, y, step.z])
      }
    }
    let solid = solidOf(Manifold.hull(points))

    // A footprint narrower than twice the wall offsets away to nothing. Its bounds
    // come back infinite, which would send everything downstream to NaN.
    const wellOutline = section(outline.offset(-config.wallThickness, 'Miter', 2, config.segments))
    if (wellOutline.isEmpty()) throw new Error('Walls leave no room inside — thin the wall')

    const wellBounds = wellOutline.bounds()
    const halfWidth = (wellBounds.max[0] - wellBounds.min[0]) / 2
    const halfLength = (wellBounds.max[1] - wellBounds.min[1]) / 2
    const wellReach = Math.hypot(halfWidth, halfLength)

    // Cut past the top face so no zero-thickness skin is left behind.
    const plug = solidOf(wellOutline.extrude(wellDepth + 1))
    solid = solidOf(solid.subtract(solidOf(plug.translate([0, 0, config.floorThickness]))))

    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const bossRadius = pocketRadius + config.magnets.bossWall
    const fiveCross =
      config.magnets.layout === 'five-cross' && (config.magnets.patternVersion === 1 || supportsFivePocketCross(config.shape, config.width))
    const magnets = magnetPositions(config.magnets.count, halfWidth, halfLength, bossRadius + LABEL_MARGIN, {
      ellipticalRow: config.shape === 'oval',
      layout: fiveCross ? 'five-cross' : config.magnets.layout === 'lattice' ? 'lattice' : 'balanced',
      latticePitch: config.magnets.latticePitch,
    })

    /*
     * The boss carries the pocket the full depth of the well, and the pocket is cut
     * only as deep as the magnet plus its depth clearance — measured down from the
     * top. The magnet can finish flush with the top of the boss while leaving room
     * for adhesive behind it.
     */
    const pocketDepth = Math.min(config.magnets.thickness + config.magnets.depthClearance, wellDepth)

    if (magnets.length > 0) {
      // Bosses carry the pockets up through the well so magnets seat against the floor.
      const bossDisc = section(CrossSection.circle(bossRadius, config.segments))
      const bossColumn = solidOf(bossDisc.extrude(wellDepth))
      for (const m of magnets) {
        solid = solidOf(solid.add(solidOf(bossColumn.translate([m.x, m.y, config.floorThickness]))))
      }
    }

    // Single spokes from the centre outwards, phased to run through the bosses.
    // Intersecting the well stops them at the wall.
    const spokeAngles = ribAngles(config.ribs.count, magnets, config.magnets.layout === 'lattice')
    const ribHeight = Math.min(config.ribs.height, wellDepth)
    if (spokeAngles.length > 0 && ribHeight > 0) {
      const reach = wellReach + config.wallThickness
      const bar = section(CrossSection.square([reach, config.ribs.thickness], true))
      const spoke = section(bar.translate([reach / 2, 0]))
      let spokes = section(spoke.rotate((spokeAngles[0] * 180) / Math.PI))
      for (const a of spokeAngles.slice(1)) spokes = section(spokes.add(section(spoke.rotate((a * 180) / Math.PI))))
      // Ribs run a little way into the wall. Stopping them exactly on the well
      // boundary would leave the two surfaces tangent, which welds into a pinched
      // vertex in any tool that merges by position.
      const overlap = Math.min(0.4, config.wallThickness / 2)
      const ribLimit = section(wellOutline.offset(overlap, 'Miter', 2, config.segments))
      const trimmed = section(spokes.intersect(ribLimit))
      const column = solidOf(trimmed.extrude(ribHeight))
      solid = solidOf(solid.add(solidOf(column.translate([0, 0, config.floorThickness]))))
    }

    if (config.label.enabled && font) {
      const text = config.label.text?.trim() || defaultLabel(config)
      const polys = textPolygons(font, text, config.label.height)
      if (polys.length > 0) {
        const room = section(wellOutline.offset(-LABEL_MARGIN, 'Miter', 2, config.segments))
        const contours = room.toPolygons()
        const obstacles = [
          ...magnets.map((m) => ({ x: m.x, y: m.y, r: bossRadius })),
          ...ribObstacles(spokeAngles, wellReach, config.ribs.thickness),
        ]
        const fit = fitLabel(
          polygonsWidth(polys),
          config.label.height,
          wellReach,
          (x, y) => pointInContours(contours, x, y),
          obstacles,
          labelAngles(spokeAngles, magnets),
        )
        if (fit) {
          const scaled: Polygon[] = polys.map((p) => p.map(([x, y]): [number, number] => [x * fit.scale, y * fit.scale]))
          const glyphs = section(CrossSection.ofPolygons(scaled, 'EvenOdd'))
          const placed = section(glyphs.translate([fit.x, fit.y]))
          const raised = solidOf(placed.extrude(Math.min(config.label.emboss, wellDepth)))
          solid = solidOf(solid.add(solidOf(raised.translate([0, 0, config.floorThickness]))))
        }
      }
    }

    // Pockets open on the face that meets the tray, which is the top of the model
    // as built, since the part is modelled the way it prints.
    if (magnets.length > 0) {
      const pocketDisc = section(CrossSection.circle(pocketRadius, config.segments))
      const drill = solidOf(pocketDisc.extrude(pocketDepth + 1.001))
      const z = config.height - pocketDepth
      for (const m of magnets) {
        solid = solidOf(solid.subtract(solidOf(drill.translate([m.x, m.y, z]))))
      }
    }

    const volume = solid.volume()
    const triangles = solid.numTri()
    return {
      mesh: solid.getMesh(),
      // Manifold guarantees watertight output, so anything with substance is printable.
      stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 },
    }
  } finally {
    for (const o of trash) o.delete()
  }
}
