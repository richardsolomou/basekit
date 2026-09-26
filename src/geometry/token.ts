import type { CrossSection, ManifoldToplevel, Vec3 } from 'manifold-3d'
import type { Font } from 'opentype.js'
import type { BuildResult } from './base'
import { trimNumber } from './outline'
import { profileSteps } from './profile'
import { curveTolerance, previewSegmentsFor } from './quality'
import { glyphOutlines, type Polygon } from './text'
import { traceSilhouette } from './trace'
import type { TokenConfig, TokenImage } from './types'

const PLA_DENSITY = 1.24e-3
/** Clear top face left between the artwork and the start of the edge treatment. */
export const TOKEN_FACE_MARGIN = 1.5
/** Smallest cap height worth printing; below it the text is refused rather than shrunk. */
export const MIN_TOKEN_TEXT_HEIGHT = 1.5
/** Features narrower than a 0.4mm nozzle's line are opened away before they reach the slicer. */
const MIN_FEATURE = 0.4
const LINE_PITCH = 1.3
const MAX_LINES = 3
/** Where the face divides when it carries both an image and text, as a fraction of its radius. */
const IMAGE_TEXT_SPLIT = -0.2
const IMAGE_TEXT_GAP = 1

export function defaultTokenConfig(): TokenConfig {
  return {
    kind: 'token',
    diameter: 40,
    thickness: 3,
    profile: 'bevel',
    profileSize: 0.6,
    text: '1',
    textHeight: 20,
    image: null,
    threshold: 0.5,
    invert: false,
    emboss: 1,
    segments: previewSegmentsFor(40),
  }
}

const hasArtwork = (config: TokenConfig) => Boolean(config.text.trim() || config.image)

export const tokenHeight = (config: TokenConfig): number => config.thickness + (hasArtwork(config) ? config.emboss : 0)

/** Radius of the flat top face the artwork may occupy. */
export const tokenFaceRadius = (config: TokenConfig): number =>
  config.diameter / 2 - (config.profile === 'straight' ? 0 : config.profileSize) - TOKEN_FACE_MARGIN

/** Largest edge treatment that fits the thickness and still leaves a face for the artwork. */
export const maxTokenEdgeSize = ({ diameter, thickness }: Pick<TokenConfig, 'diameter' | 'thickness'>): number =>
  Math.max(0, Math.min(3, thickness - 0.1, diameter / 2 - TOKEN_FACE_MARGIN - 2.5))

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function tokenName(config: TokenConfig): string {
  const label = slug(config.text) || slug(config.image?.name.replace(/\.[^.]*$/, '') ?? '')
  return `token-${trimNumber(config.diameter)}mm${label ? `-${label}` : ''}`
}

interface Rect {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * Largest scale, up to `limit`, at which the rectangles fit inside the face
 * circle and the horizontal band, centred on the band. Shrinking a centred
 * block never pushes a corner outward, so the search is monotonic.
 */
function fitScale(rects: Rect[], radius: number, bottom: number, top: number, limit: number): number {
  const low = Math.min(...rects.map((r) => r.y0))
  const high = Math.max(...rects.map((r) => r.y1))
  const middle = (low + high) / 2
  const centre = (bottom + top) / 2
  const fits = (scale: number) =>
    rects.every((r) =>
      [r.y0, r.y1].every((y) => {
        const placed = centre + (y - middle) * scale
        return placed >= bottom && placed <= top && Math.hypot(Math.max(Math.abs(r.x0), Math.abs(r.x1)) * scale, placed) <= radius
      }),
    )
  if (fits(limit)) return limit
  let a = 0
  let b = limit
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2
    if (fits(m)) a = m
    else b = m
  }
  return a
}

/** Every way of breaking the words into at most `maxLines` lines, fewest lines first. */
function wraps(words: string[], maxLines: number): string[][] {
  const results: string[][] = []
  const split = (rest: string[], lines: string[], remaining: number) => {
    if (remaining === 1) {
      results.push([...lines, rest.join(' ')])
      return
    }
    for (let i = 1; i < rest.length; i++) split(rest.slice(i), [...lines, rest.slice(0, i).join(' ')], remaining - 1)
  }
  for (let count = 1; count <= Math.min(maxLines, words.length); count++) split(words, [], count)
  return results
}

interface Placement {
  polygons: Polygon[]
  rects: Rect[]
}

/** Text lines at the requested cap height, baselines stacked downward from y = 0. */
function textBlock(font: Font, lines: string[], capHeight: number): Placement {
  const capUnits = font.charToGlyph('H').getBoundingBox().y2
  const fontSize = (capHeight * font.unitsPerEm) / capUnits
  const polygons: Polygon[] = []
  const rects: Rect[] = []
  lines.forEach((line, index) => {
    const outlines = glyphOutlines(font, line, fontSize)
    if (outlines.length === 0) return
    const xs = outlines.flatMap((p) => p.map(([x]) => x))
    const ys = outlines.flatMap((p) => p.map(([, y]) => y))
    const shift = -(Math.min(...xs) + Math.max(...xs)) / 2
    const baseline = -index * capHeight * LINE_PITCH
    polygons.push(...outlines.map((p) => p.map(([x, y]): [number, number] => [x + shift, y + baseline])))
    const half = (Math.max(...xs) - Math.min(...xs)) / 2
    rects.push({ x0: -half, x1: half, y0: Math.min(...ys) + baseline, y1: Math.max(...ys) + baseline })
  })
  return { polygons, rects }
}

/** Places polygons so their block is centred on the band at the given scale. */
function place(block: Placement, scale: number, bottom: number, top: number): Polygon[] {
  const middle = (Math.min(...block.rects.map((r) => r.y0)) + Math.max(...block.rects.map((r) => r.y1))) / 2
  const centre = (bottom + top) / 2
  return block.polygons.map((p) => p.map(([x, y]): [number, number] => [x * scale, centre + (y - middle) * scale]))
}

function decodeLuminance(image: TokenImage): Uint8Array {
  const binary = atob(image.luminance)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Printed the way it is used: the table face on the build plate and the artwork
 * standing up from the top, so nothing overhangs. The edge treatment sits on the
 * top edge, where it is seen, rather than at the plate as on a base.
 */
export function buildToken(wasm: ManifoldToplevel, config: TokenConfig, font?: Font): BuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }

  try {
    if (config.thickness < 1) throw new Error('Token must be at least 1 mm thick')
    const radius = tokenFaceRadius(config)
    if (radius <= 0) throw new Error('Edge treatment leaves no flat face — reduce the edge size')

    const tolerance = curveTolerance(config.diameter, config.segments)
    const outline = own(CrossSection.circle(config.diameter / 2, config.segments))
    const points: Vec3[] = []
    for (const step of profileSteps(config.thickness, config.profile, config.profileSize, tolerance)) {
      const ring: CrossSection = step.inset > 0 ? own(outline.offset(-step.inset, 'Miter', 2, config.segments)) : outline
      for (const contour of ring.toPolygons()) {
        for (const [x, y] of contour) points.push([x, y, config.thickness - step.z])
      }
    }
    let solid = own(Manifold.hull(points))

    const words = config.text.trim().split(/\s+/).filter(Boolean)
    const hasText = Boolean(font) && words.length > 0
    const split = radius * IMAGE_TEXT_SPLIT
    const imageBand: [number, number] = hasText ? [split + IMAGE_TEXT_GAP / 2, radius] : [-radius, radius]
    const textBand: [number, number] = config.image ? [-radius, split - IMAGE_TEXT_GAP / 2] : [-radius, radius]
    const artwork: CrossSection[] = []

    if (config.image) {
      const { width, height } = config.image
      const loops = traceSilhouette(decodeLuminance(config.image), width, height, config.threshold, config.invert)
      const traced = loops.length > 0 ? own(CrossSection.ofPolygons(loops, 'EvenOdd')) : undefined
      if (!traced || traced.isEmpty()) throw new Error('Image has nothing to raise — adjust the threshold or invert it')
      const { min, max } = traced.bounds()
      const centred = own(traced.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2]))
      const half = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2]
      const rect = { x0: -half[0], x1: half[0], y0: -half[1], y1: half[1] }
      const scale = fitScale([rect], radius, ...imageBand, (2 * radius) / Math.max(width, height))
      const placed = own(own(centred.scale(scale)).translate([0, (imageBand[0] + imageBand[1]) / 2]))
      const opened = own(own(placed.offset(-MIN_FEATURE / 2, 'Round', 2, 16)).offset(MIN_FEATURE / 2, 'Round', 2, 16))
      if (opened.isEmpty()) throw new Error('Image detail is finer than a printer can lay down — enlarge the token or simplify the image')
      artwork.push(opened)
    }

    if (hasText && font) {
      const candidates = wraps(words, config.image ? 2 : MAX_LINES).map((lines) => {
        const block = textBlock(font, lines, config.textHeight)
        return { block, scale: fitScale(block.rects, radius, ...textBand, 1) }
      })
      // The largest text wins, and among equals the fewest lines, which come first.
      const best = candidates.reduce((a, b) => (b.scale > a.scale + 1e-9 ? b : a))
      if (best.scale * config.textHeight < MIN_TOKEN_TEXT_HEIGHT) {
        throw new Error('Text is too long to read at this size — shorten it or enlarge the token')
      }
      artwork.push(own(CrossSection.ofPolygons(place(best.block, best.scale, ...textBand), 'EvenOdd')))
    }

    if (artwork.length > 0 && config.emboss > 0) {
      // Offsetting can leave coincident points, which extrude into a pinched edge once a slicer welds vertices.
      const face = own(own(CrossSection.union(artwork)).simplify(1e-3))
      solid = own(solid.add(own(own(face.extrude(config.emboss)).translate([0, 0, config.thickness]))))
    }

    const volume = solid.volume()
    const triangles = solid.numTri()
    return {
      mesh: solid.getMesh(),
      stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 },
    }
  } finally {
    for (const value of trash) value.delete()
  }
}
