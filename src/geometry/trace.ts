import type { Polygon } from './text'

/**
 * Traces the outline of every region darker than `threshold` with marching
 * squares, interpolating along each cell edge so antialiased artwork keeps
 * smooth curves instead of pixel steps. The field is padded with background, so
 * every contour closes. Coordinates are in pixels with y pointing up, and the
 * loops are meant to be filled even-odd, which makes their winding irrelevant.
 *
 * `luminance` holds one 0–255 value per pixel, row by row from the top.
 */
export function traceSilhouette(luminance: Uint8Array, width: number, height: number, threshold: number, invert = false): Polygon[] {
  const w = width + 2
  const h = height + 2
  // Positive inside the silhouette, so the sign alone says which side a corner is on.
  const field = new Float32Array(w * h).fill(-1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = luminance[y * width + x] / 255
      field[(y + 1) * w + x + 1] = invert ? value - threshold : threshold - value
    }
  }
  const at = (x: number, y: number) => field[y * w + x]
  const inside = (x: number, y: number) => at(x, y) > 0

  // Crossing points are keyed by the grid edge they sit on, which two cells share.
  const horizontal = (x: number, y: number) => 2 * (y * w + x)
  const vertical = (x: number, y: number) => 2 * (y * w + x) + 1
  const point = (key: number): [number, number] => {
    const index = key >> 1
    const x = index % w
    const y = Math.floor(index / w)
    const [x2, y2] = key & 1 ? [x, y + 1] : [x + 1, y]
    const a = at(x, y)
    const t = a / (a - at(x2, y2))
    return [x + (x2 - x) * t - 1, height + 1 - (y + (y2 - y) * t)]
  }

  const next = new Map<number, number>()
  const link = (from: number, to: number) => next.set(from, to)
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = inside(x, y)
      const tr = inside(x + 1, y)
      const br = inside(x + 1, y + 1)
      const bl = inside(x, y + 1)
      const top = horizontal(x, y)
      const right = vertical(x + 1, y)
      const bottom = horizontal(x, y + 1)
      const left = vertical(x, y)
      const index = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0)
      // Each segment runs with the silhouette on the same side, so loops chain head to tail.
      switch (index) {
        case 1:
          link(left, bottom)
          break
        case 2:
          link(bottom, right)
          break
        case 3:
          link(left, right)
          break
        case 4:
          link(right, top)
          break
        case 6:
          link(bottom, top)
          break
        case 7:
          link(left, top)
          break
        case 8:
          link(top, left)
          break
        case 9:
          link(top, bottom)
          break
        case 11:
          link(top, right)
          break
        case 12:
          link(right, left)
          break
        case 13:
          link(right, bottom)
          break
        case 14:
          link(bottom, left)
          break
        case 5:
        case 10: {
          // Saddle: the cell centre decides whether the two inside corners join.
          const joined = at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1) > 0
          if (index === 5) {
            if (joined) {
              link(left, top)
              link(right, bottom)
            } else {
              link(left, bottom)
              link(right, top)
            }
          } else if (joined) {
            link(top, right)
            link(bottom, left)
          } else {
            link(top, left)
            link(bottom, right)
          }
          break
        }
      }
    }
  }

  const loops: Polygon[] = []
  for (const start of next.keys()) {
    const loop: Polygon = []
    let key = start
    while (next.has(key)) {
      loop.push(point(key))
      const following = next.get(key)!
      next.delete(key)
      key = following
    }
    if (loop.length > 2) loops.push(loop)
  }
  return loops
}
