import type { Mesh } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import {
  buildPaintingHandle,
  buildPaintingTray,
  defaultPaintingTrayConfig,
  minimumPaintingTrayEdgeMargin,
  minimumPaintingTrayHeight,
  minimumPaintingTraySpacing,
  paintingHandleConfig,
  paintingTrayAssemblyHeight,
  paintingTrayLayout,
  paintingTrayMagnetPocketCount,
} from './paintingTray'

let wasm: Awaited<ReturnType<typeof loadManifold>>

beforeAll(async () => {
  wasm = await loadManifold()
})

function bounds(mesh: Mesh) {
  const { numProp, vertProperties } = mesh
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < vertProperties.length; index += numProp) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertProperties[index + axis])
      max[axis] = Math.max(max[axis], vertProperties[index + axis])
    }
  }
  return { min, size: max.map((value, axis) => value - min[axis]) }
}

describe('painting tray', () => {
  it('places intermediate pockets diagonally between the default four-by-four grid', () => {
    const config = defaultPaintingTrayConfig()
    const layout = paintingTrayLayout(config)

    expect(layout).toMatchObject({ columns: 4, rows: 4, width: 159, length: 159 })
    expect(layout.magnetCenters).toHaveLength(25)
    expect(layout.magnetCenters).toContainEqual({ x: -45, y: -45 })
    expect(layout.magnetCenters).toContainEqual({ x: 0, y: 0 })
    expect(layout.magnetCenters).toContainEqual({ x: 45, y: 45 })
    expect(paintingTrayMagnetPocketCount(config)).toBe(25)
  })

  it('builds a low solid tray with one top-opening pocket', () => {
    const defaults = defaultPaintingTrayConfig()
    const config = { ...defaults, columns: 1, rows: 1, assembly: false }
    const result = buildPaintingTray(wasm, config)
    const measured = bounds(result.mesh)
    const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
    let pocketBottom = Infinity
    for (let index = 0; index < result.mesh.vertProperties.length; index += result.mesh.numProp) {
      const x = result.mesh.vertProperties[index]
      const y = result.mesh.vertProperties[index + 1]
      if (Math.hypot(x, y) <= pocketRadius + 0.05) {
        pocketBottom = Math.min(pocketBottom, result.mesh.vertProperties[index + 2])
      }
    }

    expect(result.stats.solid).toBe(true)
    expect(measured.min[2]).toBeCloseTo(0, 5)
    expect(measured.size).toEqual([24, 24, 3])
    expect(paintingTrayMagnetPocketCount(config)).toBe(1)
    expect(pocketBottom).toBeCloseTo(config.height - config.magnets.thickness - config.magnets.depthClearance, 2)
  })

  it('shows the glue-on arch beneath the assembled tray', () => {
    const config = defaultPaintingTrayConfig()
    const measured = bounds(buildPaintingTray(wasm, config).mesh)

    expect(measured.min[2]).toBeCloseTo(-41.9, 1)
    expect(measured.size[2]).toBeCloseTo(paintingTrayAssemblyHeight(config), 1)
  })

  it('orients the detachable handle as a separate printable solid', () => {
    const result = buildPaintingHandle(wasm, paintingHandleConfig(defaultPaintingTrayConfig()))
    const measured = bounds(result.mesh)

    expect(result.stats.solid).toBe(true)
    expect(measured.min[2]).toBeCloseTo(0, 5)
    expect(measured.size[0]).toBeCloseTo(92, 1)
  })

  it('rejects a tray that leaves too little material below its magnet pockets', () => {
    const config = defaultPaintingTrayConfig()
    expect(() => buildPaintingTray(wasm, { ...config, height: minimumPaintingTrayHeight(config) - 0.01 })).toThrow(/too little material/)
  })

  it('rejects a grid without enough material between adjacent pockets', () => {
    const config = defaultPaintingTrayConfig()
    expect(() => buildPaintingTray(wasm, { ...config, spacing: minimumPaintingTraySpacing(config) - 0.01 })).toThrow(/diagonal pockets/)
  })

  it('rejects a grid without enough material between pockets and the edge', () => {
    const config = defaultPaintingTrayConfig()
    expect(() => buildPaintingTray(wasm, { ...config, edgeMargin: minimumPaintingTrayEdgeMargin(config) - 0.01 })).toThrow(/outer pockets/)
  })
})
