import type { Font, PathCommand } from 'opentype.js'

export type Polygon = [number, number][]

/** Segments per quadratic/cubic curve. Digits at ~6mm need very little. */
const CURVE_STEPS = 8

const quad = (p0: number, p1: number, p2: number, t: number) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

/**
 * Flattens glyph outlines into closed polygons in mm, centred on the origin and
 * scaled so the tallest glyph matches `capHeight`. Y is flipped from font space
 * so the text reads correctly looking down at the well floor.
 *
 * Glyphs are converted one at a time rather than through `font.getPath`, whose
 * shaper throws on fonts using substitution formats it does not implement.
 */
export function textPolygons(font: Font, text: string, capHeight: number): Polygon[] {
  const commands: PathCommand[] = []
  let pen = 0
  for (const ch of text) {
    const glyph = font.charToGlyph(ch)
    commands.push(...glyph.getPath(pen, 0, font.unitsPerEm).commands)
    pen += glyph.advanceWidth ?? 0
  }

  const contours: Polygon[] = []
  let current: Polygon = []
  let cx = 0
  let cy = 0
  const push = (x: number, y: number) => {
    current.push([x, -y])
    cx = x
    cy = y
  }
  const close = () => {
    if (current.length > 2) contours.push(current)
    current = []
  }

  for (const c of commands) {
    if (c.type === 'M') {
      close()
      push(c.x, c.y)
    } else if (c.type === 'L') {
      push(c.x, c.y)
    } else if (c.type === 'Q') {
      const [x0, y0] = [cx, cy]
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS
        current.push([quad(x0, c.x1, c.x, t), -quad(y0, c.y1, c.y, t)])
      }
      cx = c.x
      cy = c.y
    } else if (c.type === 'C') {
      const [x0, y0] = [cx, cy]
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS
        current.push([cubic(x0, c.x1, c.x2, c.x, t), -cubic(y0, c.y1, c.y2, c.y, t)])
      }
      cx = c.x
      cy = c.y
    } else if (c.type === 'Z') {
      close()
    }
  }
  close()

  if (contours.length === 0) return []

  const xs = contours.flatMap((p) => p.map(([x]) => x))
  const ys = contours.flatMap((p) => p.map(([, y]) => y))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const scale = capHeight / (maxY - minY)
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  return contours.map((p) => p.map(([x, y]): [number, number] => [(x - midX) * scale, (y - midY) * scale]))
}

/** Width in mm the polygons occupy, for fitting the label into the well. */
export function polygonsWidth(polys: Polygon[]): number {
  if (polys.length === 0) return 0
  const xs = polys.flatMap((p) => p.map(([x]) => x))
  return Math.max(...xs) - Math.min(...xs)
}
