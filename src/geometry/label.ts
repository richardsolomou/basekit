export interface LabelCircle {
  x: number
  y: number
  r: number
}

export const LABEL_MARGIN = 0.8
const TAU = 2 * Math.PI

const span = (from: number, to: number) => String.fromCodePoint(...Array.from({ length: to - from + 1 }, (_, i) => from + i))

/** Printable ASCII and Latin-1, all drawn by the bundled Oswald, less the invisible no-break space and soft hyphen. */
export const LABEL_CHARACTERS = span(0x20, 0x7e) + span(0xa1, 0xac) + span(0xae, 0xff)
export const LABEL_MAX_LENGTH = 20
const accepted = new Set(LABEL_CHARACTERS)

/** Custom label text reduced to what the font can draw, at most `LABEL_MAX_LENGTH` characters. */
export const labelText = (text: string) =>
  [...text]
    .filter((ch) => accepted.has(ch))
    .join('')
    .slice(0, LABEL_MAX_LENGTH)

function boxHitsCircle(cx: number, cy: number, hw: number, hh: number, c: LabelCircle, pad: number): boolean {
  const dx = Math.max(Math.abs(c.x - cx) - hw, 0)
  const dy = Math.max(Math.abs(c.y - cy) - hh, 0)
  return Math.hypot(dx, dy) < c.r + pad
}

export function pointInContours(contours: readonly (readonly number[][])[], x: number, y: number): boolean {
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

export function fitLabel(
  width: number,
  height: number,
  reach: number,
  inside: (x: number, y: number) => boolean,
  obstacles: LabelCircle[],
  angles: number[],
  margin = LABEL_MARGIN,
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
        if (clearsWall && !obstacles.some((o) => boxHitsCircle(x, y, hw, hh, o, margin))) feasible.push(rc)
      }
      if (feasible.length > 0) {
        const rc = feasible[Math.floor(feasible.length / 2)]
        return { scale, x: rc * Math.cos(angle), y: rc * Math.sin(angle) }
      }
    }
  }
  return undefined
}

/** Directions a label may sit along, widest clear angle first. */
export function labelAngles(spokes: number[], magnets: LabelCircle[]): number[] {
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
