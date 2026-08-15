import type { Mesh } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import { buildTier, defaultTierConfig } from './tier'

let wasm: Awaited<ReturnType<typeof loadManifold>>
beforeAll(async () => {
  wasm = await loadManifold()
})

function bounds(mesh: Mesh) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], mesh.vertProperties[i + axis])
      max[axis] = Math.max(max[axis], mesh.vertProperties[i + axis])
    }
  }
  return max.map((value, axis) => value - min[axis])
}

describe('buildTier', () => {
  it('builds the requested Gridfinity module and clearance', () => {
    const config = defaultTierConfig()
    const result = buildTier(wasm, config)
    expect(result.stats.solid).toBe(true)
    expect(bounds(result.mesh)[0]).toBeCloseTo(125.5, 4)
    expect(bounds(result.mesh)[1]).toBeCloseTo(83.5, 4)
    expect(bounds(result.mesh)[2]).toBeCloseTo(89, 4)
  })

  it('rejects a deck too thin for the locating sockets', () => {
    expect(() => buildTier(wasm, { ...defaultTierConfig(), deckThickness: 3 })).toThrow('deck is too thin')
  })
})
