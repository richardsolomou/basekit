import type { Mesh } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { adapterName, buildAdapter, defaultAdapterConfig, minAdapterHeight } from './adapter'
import { loadManifold } from './manifold'
import type { AdapterConfig } from './types'

let wasm: Awaited<ReturnType<typeof loadManifold>>

beforeAll(async () => {
  wasm = await loadManifold()
})

const adapter = (overrides: Partial<AdapterConfig> = {}): AdapterConfig => ({ ...defaultAdapterConfig(), ...overrides })
const withMagnets = (config: AdapterConfig, count = 1): AdapterConfig => {
  const next = { ...config, magnets: { ...config.magnets, enabled: true, count } }
  return { ...next, height: minAdapterHeight(next) }
}

function vertices(mesh: Mesh) {
  const { numProp, vertProperties: v } = mesh
  return Array.from({ length: v.length / numProp }, (_, i) => ({ x: v[i * numProp], y: v[i * numProp + 1], z: v[i * numProp + 2] }))
}

function bounds(mesh: Mesh) {
  const points = vertices(mesh)
  return {
    min: [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)), Math.min(...points.map((p) => p.z))],
    max: [Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y)), Math.max(...points.map((p) => p.z))],
  }
}

/** Vertices on one horizontal plane, which for a straight-walled adapter belong only to the recess or a pocket. */
const atHeight = (mesh: Mesh, z: number) => vertices(mesh).filter((p) => Math.abs(p.z - z) < 1e-4)

describe('buildAdapter', () => {
  it('turns a 25mm round into a 32mm round by default', () => {
    expect(adapterName(defaultAdapterConfig())).toBe('adapter-round-25mm-to-round-32mm')
  })

  it('names exact sizes without rounding', () => {
    const config = adapter({
      source: { shape: 'round', width: 28.5, length: 28.5 },
      target: { shape: 'rect', width: 40, length: 40 },
    })
    expect(adapterName(config)).toBe('adapter-round-28.5mm-to-rect-40x40mm')
  })

  it('builds the target footprint at the requested height on the print axis', () => {
    const config = adapter({
      source: { shape: 'round', width: 20, length: 20 },
      target: { shape: 'rect', width: 50, length: 25 },
      profile: 'straight',
    })
    const { min, max } = bounds(buildAdapter(wasm, config).mesh)

    expect([max[0] - min[0], max[1] - min[1], min[2], max[2]].map((value) => Number(value.toFixed(4)))).toEqual([50, 25, 0, config.height])
  })

  it('cuts a recess of the old base plus clearance, open at the top', () => {
    const config = adapter({ profile: 'straight' })
    const floor = atHeight(buildAdapter(wasm, config).mesh, config.height - config.recessDepth)
    const radius = Math.max(...floor.map((p) => Math.hypot(p.x, p.y)))

    expect(radius).toBeCloseTo((25 + config.clearance) / 2, 3)
  })

  it('turns an elongated old base to share the target long axis', () => {
    const config = adapter({
      source: { shape: 'oval', width: 60, length: 35 },
      target: { shape: 'rect', width: 50, length: 100 },
      profile: 'straight',
      // A multiple of four puts vertices on both axes.
      segments: 128,
    })
    const floor = atHeight(buildAdapter(wasm, config).mesh, config.height - config.recessDepth)
    const reach = [Math.max(...floor.map((p) => Math.abs(p.x))), Math.max(...floor.map((p) => Math.abs(p.y)))]

    expect(reach.map((value) => Number((value * 2).toFixed(3)))).toEqual([35 + config.clearance, 60 + config.clearance])
  })

  it('opens flush magnet pockets on the underside', () => {
    const config = withMagnets(adapter({ profile: 'straight' }))
    const ceiling = atHeight(buildAdapter(wasm, config).mesh, config.magnets.thickness + config.magnets.depthClearance)
    const radius = Math.max(...ceiling.map((p) => Math.hypot(p.x, p.y)))

    expect(radius).toBeCloseTo((config.magnets.diameter + config.magnets.clearance) / 2, 3)
  })

  it.each([
    ['round into round', adapter()],
    ['oval into rect', adapter({ source: { shape: 'oval', width: 60, length: 35 }, target: { shape: 'rect', width: 50, length: 100 } })],
    [
      'round into square with magnets',
      withMagnets(adapter({ source: { shape: 'round', width: 32, length: 32 }, target: { shape: 'rect', width: 40, length: 40 } }), 4),
    ],
    ['hex into pill', adapter({ source: { shape: 'polygon', width: 32, length: 32 }, target: { shape: 'pill', width: 60, length: 35 } })],
  ])('builds %s as one solid with no coincident vertices', (_, config) => {
    const { mesh, stats } = buildAdapter(wasm, config)
    const positions = new Set(vertices(mesh).map((p) => `${p.x},${p.y},${p.z}`))

    expect({ solid: stats.solid, duplicates: vertices(mesh).length - positions.size }).toEqual({ solid: true, duplicates: 0 })
  })

  it('rejects an old base as large as the target', () => {
    expect(() => buildAdapter(wasm, adapter({ source: { shape: 'round', width: 32, length: 32 } }))).toThrow(/Ø32 does not fit inside Ø32/)
  })

  it('rejects an old base whose corners breach the wall even though its bounds fit', () => {
    const config = adapter({ source: { shape: 'rect', width: 20, length: 20 }, target: { shape: 'round', width: 28, length: 28 } })
    expect(() => buildAdapter(wasm, config)).toThrow(/does not fit inside/)
  })

  it('accepts an old base that clears the wall at the top edge', () => {
    const config = adapter({ source: { shape: 'round', width: 20, length: 20 }, target: { shape: 'rect', width: 25, length: 25 } })
    expect(buildAdapter(wasm, config).stats.solid).toBe(true)
  })

  it('rejects an edge profile that thins the wall beside the recess', () => {
    const config = adapter({
      source: { shape: 'round', width: 20, length: 20 },
      target: { shape: 'rect', width: 25, length: 25 },
      profileSize: 2,
    })
    expect(() => buildAdapter(wasm, config)).toThrow(/Edge profile/)
  })

  it('rejects magnet pockets that would meet the recess floor', () => {
    const config = withMagnets(adapter())
    expect(() => buildAdapter(wasm, { ...config, height: config.height - 0.5 })).toThrow(/magnet pockets/)
  })
})
