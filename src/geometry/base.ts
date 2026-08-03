import type { CrossSection, Manifold, ManifoldToplevel, Mesh, Vec3 } from 'manifold-3d'
import type { Font } from 'opentype.js'
import { baseOutline, defaultLabel } from './outline'
import { profileSteps } from './profile'
import { polygonsWidth, textPolygons, type Polygon } from './text'
import type { BaseConfig, BaseStats } from './types'

export interface BuildResult {
  mesh: Mesh
  stats: BaseStats
}

/** Clearance kept between the label and the well wall, a boss or a rib. */
const LABEL_MARGIN = 0.8
const PLA_DENSITY = 1.24e-3 // g/mm³
/** Beyond this width-to-length ratio, magnets line up along the long axis instead of on a ring. */
const ELONGATED_RATIO = 1.35

export interface Circle {
  x: number
  y: number
  r: number
}

/** Whether magnets sit on a ring, rather than in a row down the long axis. */
export function magnetsRing(width: number, length: number): boolean {
  return Math.max(width, length) / Math.min(width, length) <= ELONGATED_RATIO
}

/**
 * Magnet centres. Round-ish footprints get a ring so the pull is even; long ones
 * get a row down the major axis, which is where the material actually is.
 */
export function magnetPositions(count: number, halfWidth: number, halfLength: number, clear: number): Circle[] {
  if (count <= 0) return []
  if (count === 1) return [{ x: 0, y: 0, r: 0 }]

  const long = Math.max(halfWidth, halfLength)
  const short = Math.min(halfWidth, halfLength)
  if (!magnetsRing(halfWidth, halfLength)) {
    const reach = Math.max(long - clear, 0)
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
 * narrow ones, which is what lets the marking stay large.
 *
 * Bracing the span *between* bosses would be the alternative, but a boss is a
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
export function ribAngles(count: number, magnets: Circle[]): number[] {
  if (count <= 0) return []
  const spacing = TAU / count
  const spokes = (phase: number) => Array.from({ length: count }, (_, i) => phase + spacing * i)

  const bosses = magnets.filter((m) => Math.hypot(m.x, m.y) > 1e-6).map((m) => Math.atan2(m.y, m.x))
  if (bosses.length === 0) return spokes(Math.PI / 2)

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

function boxHitsCircle(cx: number, cy: number, hw: number, hh: number, c: Circle, pad: number): boolean {
  const dx = Math.max(Math.abs(c.x - cx) - hw, 0)
  const dy = Math.max(Math.abs(c.y - cy) - hh, 0)
  return Math.hypot(dx, dy) < c.r + pad
}

/** Approximates each rib spoke as overlapping discs, so label fitting only sees circles. */
function ribObstacles(angles: number[], length: number, thickness: number): Circle[] {
  if (!Number.isFinite(length) || length <= 0) return []
  const step = Math.max(0.4, thickness / 2)
  return angles.flatMap((a) => {
    const discs: Circle[] = []
    for (let r = 0; r <= length; r += step) discs.push({ x: r * Math.cos(a), y: r * Math.sin(a), r: thickness / 2 })
    return discs
  })
}

function pointInContours(contours: readonly (readonly number[][])[], x: number, y: number): boolean {
  let inside = false
  for (const ring of contours) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * Finds a spot for the label on the well floor. Every candidate direction is tried
 * at full size before the text is shrunk, so a cramped rank base still gets its
 * number rather than losing it.
 */
function fitLabel(
  width: number,
  height: number,
  reach: number,
  inside: (x: number, y: number) => boolean,
  obstacles: Circle[],
  angles: number[],
) {
  for (let attempt = 0; attempt < 14; attempt++) {
    const scale = 0.92 ** attempt
    const hw = (width * scale) / 2
    const hh = (height * scale) / 2
    for (const angle of angles) {
      const feasible: number[] = []
      for (let rc = 0; rc <= reach; rc += 0.25) {
        const x = rc * Math.cos(angle)
        const y = rc * Math.sin(angle)
        const clearsWall = inside(x - hw, y - hh) && inside(x + hw, y - hh) && inside(x - hw, y + hh) && inside(x + hw, y + hh)
        if (clearsWall && !obstacles.some((o) => boxHitsCircle(x, y, hw, hh, o, LABEL_MARGIN))) feasible.push(rc)
      }
      // Centre it in the clear band rather than hugging whichever end came first.
      if (feasible.length > 0) {
        const rc = feasible[Math.floor(feasible.length / 2)]
        return { scale, x: rc * Math.cos(angle), y: rc * Math.sin(angle) }
      }
    }
  }
  return undefined
}

/**
 * Directions the label may sit along, widest gap first.
 *
 * Bisecting the ribs alone used to work only because the ribs and the bosses
 * shared a bearing; now that the spokes deliberately run between the bosses, a
 * rib bisector aims straight at one. So the candidates come from the gaps
 * between every solid thing on the floor. The diagonals stay behind them for a
 * floor with nothing on it at all.
 */
function labelAngles(spokes: number[], magnets: Circle[]): number[] {
  const bosses = magnets.filter((m) => Math.hypot(m.x, m.y) > 1e-6).map((m) => Math.atan2(m.y, m.x))
  const solid = [...spokes, ...bosses].map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b)
  const gaps = solid
    .map((angle, i) => {
      const next = i + 1 < solid.length ? solid[i + 1] : solid[0] + TAU
      return { middle: (angle + next) / 2, span: next - angle }
    })
    .sort((a, b) => b.span - a.span)
  const fallback = Array.from({ length: 8 }, (_, i) => (Math.PI / 4) * i)
  return [...gaps.map((gap) => gap.middle), ...fallback]
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
    const hollow = config.underside === 'well'
    const wellDepth = config.height - config.floorThickness
    if (hollow && wellDepth < 0.2) throw new Error('No room left for a well — thin the floor')

    const outline = section(baseOutline(wasm, config))

    // Loft the body as the convex hull of the outline offset at each profile height.
    // Every supported footprint is convex, so the hull is exactly the intended solid.
    const points: Vec3[] = []
    for (const step of profileSteps(config.height, config.profile, config.profileSize, config.segments)) {
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

    if (hollow) {
      // Cut past the top face so no zero-thickness skin is left behind.
      const plug = solidOf(wellOutline.extrude(wellDepth + 1))
      solid = solidOf(solid.subtract(solidOf(plug.translate([0, 0, config.floorThickness]))))
    }

    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    const bossRadius = pocketRadius + config.magnets.bossWall
    const magnets = magnetPositions(config.magnets.count, halfWidth, halfLength, bossRadius + LABEL_MARGIN)

    /*
     * The boss carries the pocket the full depth of the well, and the pocket is cut
     * only as deep as the magnet is thick — measured down from the top. So the
     * magnet always finishes flush with the top of the boss, and a thinner one is
     * packed out from underneath with solid material rather than left sitting at
     * the bottom of an open tube.
     */
    const seatedThickness = Math.min(config.magnets.thickness, wellDepth)

    if (hollow && magnets.length > 0) {
      // Bosses carry the pockets up through the well so magnets seat against the floor.
      const bossDisc = section(CrossSection.circle(bossRadius, config.segments))
      const bossColumn = solidOf(bossDisc.extrude(wellDepth))
      for (const m of magnets) {
        solid = solidOf(solid.add(solidOf(bossColumn.translate([m.x, m.y, config.floorThickness]))))
      }
    }

    // Single spokes from the centre outwards, phased to run between the bosses.
    // Intersecting the well stops them at the wall.
    const spokeAngles = hollow ? ribAngles(config.ribs.count, magnets) : []
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

    if (hollow && config.label.enabled && font) {
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

    // Both undersides open their pockets on the face that meets the tray, which is
    // the top of the model as built, since the part is modelled the way it prints.
    if (magnets.length > 0) {
      const depth = hollow ? seatedThickness + 1 : Math.min(config.magnets.thickness, config.height - 0.4)
      const pocketDisc = section(CrossSection.circle(pocketRadius, config.segments))
      const drill = solidOf(pocketDisc.extrude(depth + 0.001))
      const z = hollow ? config.height - seatedThickness : -0.001
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
