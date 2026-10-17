import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import type { Polygon } from './text'
import { traceSilhouette } from './trace'

let wasm: Awaited<ReturnType<typeof loadManifold>>

beforeAll(async () => {
  wasm = await loadManifold()
})

/** A white canvas with the given pixels painted black. */
function canvas(width: number, height: number, ink: (x: number, y: number) => boolean): Uint8Array {
  const pixels = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (ink(x, y)) pixels[y * width + x] = 0
  return pixels
}

function filledArea(loops: Polygon[]): number {
  const section = wasm.CrossSection.ofPolygons(loops, 'EvenOdd')
  try {
    return section.area()
  } finally {
    section.delete()
  }
}

describe('traceSilhouette', () => {
  it('traces a dark square as one closed loop', () => {
    const pixels = canvas(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)

    expect(traceSilhouette(pixels, 20, 20, 0.5)).toHaveLength(1)
  })

  it('encloses the area of the dark pixels, less the corners it rounds', () => {
    const pixels = canvas(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)

    expect(filledArea(traceSilhouette(pixels, 20, 20, 0.5))).toBeCloseTo(99.5, 5)
  })

  it('leaves the hole in a ring open', () => {
    const ring = (x: number, y: number) => Math.hypot(x - 20, y - 20) < 15 && Math.hypot(x - 20, y - 20) > 7
    const disc = (x: number, y: number) => Math.hypot(x - 20, y - 20) < 15

    const ringArea = filledArea(traceSilhouette(canvas(40, 40, ring), 40, 40, 0.5))
    expect(ringArea).toBeLessThan(filledArea(traceSilhouette(canvas(40, 40, disc), 40, 40, 0.5)) - 100)
  })

  it('closes shapes that touch the image edge', () => {
    const pixels = canvas(10, 10, (x) => x < 5)

    expect(filledArea(traceSilhouette(pixels, 10, 10, 0.5))).toBeGreaterThan(40)
  })

  it('raises the light areas when inverted', () => {
    const pixels = canvas(20, 20, (x, y) => x >= 5 && x < 15 && y >= 5 && y < 15)

    expect(filledArea(traceSilhouette(pixels, 20, 20, 0.5, true))).toBeGreaterThan(250)
  })

  it('finds nothing in a blank image', () => {
    expect(
      traceSilhouette(
        canvas(10, 10, () => false),
        10,
        10,
        0.5,
      ),
    ).toHaveLength(0)
  })

  it('puts the top row of the image at the top of the outline', () => {
    const pixels = canvas(10, 10, (_, y) => y < 3)
    const ys = traceSilhouette(pixels, 10, 10, 0.5).flatMap((loop) => loop.map(([, y]) => y))

    expect(Math.min(...ys)).toBeGreaterThan(5)
  })
})
