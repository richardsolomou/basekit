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
  paintingHandleAxisCenter,
  paintingHandleConfig,
  paintingTrayAssemblyHeight,
  paintingTrayAssemblyMinZ,
  paintingTrayCenterMarkSpan,
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

    expect(layout).toMatchObject({ columns: 4, rows: 4, width: 174, length: 174 })
    expect(layout.magnetCenters).toHaveLength(25)
    expect(layout.magnetCenters).toContainEqual({ x: -50, y: -50 })
    expect(layout.magnetCenters).toContainEqual({ x: 0, y: 0 })
    expect(layout.magnetCenters).toContainEqual({ x: 50, y: 50 })
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
      const z = result.mesh.vertProperties[index + 2]
      if (Math.hypot(x, y) <= pocketRadius + 0.05 && z > 0.4) {
        pocketBottom = Math.min(pocketBottom, z)
      }
    }

    expect(result.stats.solid).toBe(true)
    expect(measured.min[2]).toBeCloseTo(0, 5)
    expect(measured.size).toEqual([24, 24, 3])
    expect(paintingTrayMagnetPocketCount(config)).toBe(1)
    expect(pocketBottom).toBeCloseTo(config.height - config.magnets.thickness - config.magnets.depthClearance, 2)
  })

  it('shows the glue-on grip beneath the assembled tray', () => {
    const config = defaultPaintingTrayConfig()
    const measured = bounds(buildPaintingTray(wasm, config).mesh)

    expect(measured.min[2]).toBeCloseTo(-99.9, 1)
    expect(measured.size[2]).toBeCloseTo(paintingTrayAssemblyHeight(config), 1)
  })

  it('centres the spray-tray orbit on the handle axis', () => {
    const config = defaultPaintingTrayConfig()
    const angled = { ...config, handle: { ...config.handle, shape: 'pistol' as const, angle: 20 } }

    expect(paintingHandleAxisCenter(config)).toEqual([0, 0, -49.9])
    expect(paintingHandleAxisCenter(angled)[0]).toBeCloseTo(-24.36, 2)
    expect(paintingTrayAssemblyMinZ(config)).toBeCloseTo(-99.9, 5)
  })

  it('engraves a centre mark past the handle footprint', () => {
    const defaults = defaultPaintingTrayConfig()
    const config = { ...defaults, assembly: false }
    const mesh = buildPaintingTray(wasm, config).mesh
    const hasMarkFloor = Array.from({ length: mesh.vertProperties.length / mesh.numProp }, (_, index) => index * mesh.numProp).some(
      (index) =>
        Math.abs(mesh.vertProperties[index]) < 1 &&
        Math.abs(mesh.vertProperties[index + 1]) < 1 &&
        Math.abs(mesh.vertProperties[index + 2] - 0.3) < 0.01,
    )

    expect(hasMarkFloor).toBe(true)
    expect(paintingTrayCenterMarkSpan(config)).toBeGreaterThan(config.handle.width)
  })

  it.each(['round', 'oval', 'flared', 'pistol'] as const)('builds the %s handle as a printable solid', (shape) => {
    const config = defaultPaintingTrayConfig()
    const result = buildPaintingHandle(wasm, paintingHandleConfig({ ...config, handle: { ...config.handle, shape } }))
    const measured = bounds(result.mesh)

    expect(result.stats.solid).toBe(true)
    expect(measured.min[2]).toBeCloseTo(0, 5)
    expect(measured.size[2]).toBeCloseTo(config.handle.length, 1)
  })

  it('uses the configured handle length and angle', () => {
    const config = defaultPaintingTrayConfig()
    const handle = { ...config.handle, length: 110, angle: 30 }
    const measured = bounds(buildPaintingHandle(wasm, paintingHandleConfig({ ...config, handle })).mesh)

    expect(measured.size[2]).toBeCloseTo(110, 1)
    expect(measured.size[0]).toBeGreaterThan(80)
  })

  it('adds material for grip ribs', () => {
    const config = defaultPaintingTrayConfig()
    const plain = buildPaintingHandle(wasm, paintingHandleConfig(config)).stats.volume
    const ribbed = buildPaintingHandle(wasm, paintingHandleConfig({ ...config, handle: { ...config.handle, ribs: true } })).stats.volume

    expect(ribbed).toBeGreaterThan(plain)
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
