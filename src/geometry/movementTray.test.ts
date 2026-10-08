import type { Mesh } from 'manifold-3d'
import { beforeAll, describe, expect, it } from 'vitest'
import { holderSlotMagnetCenters } from './holder'
import { loadManifold } from './manifold'
import {
  buildMovementTray,
  defaultMovementTrayConfig,
  minimumMovementTrayFloor,
  movementTrayHeight,
  movementTrayLayout,
  movementTrayMagnetPocketCount,
  movementTrayName,
} from './movementTray'
import type { MovementTrayConfig } from './types'

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
  return { min, size: max.map((value, axis) => Number((value - min[axis]).toFixed(6))) }
}

function duplicatePositions(mesh: Mesh) {
  const seen = new Set<string>()
  let duplicates = 0
  for (let index = 0; index < mesh.vertProperties.length; index += mesh.numProp) {
    const key = `${mesh.vertProperties[index]},${mesh.vertProperties[index + 1]},${mesh.vertProperties[index + 2]}`
    if (seen.has(key)) duplicates++
    seen.add(key)
  }
  return duplicates
}

/** Whether there is material at a point, found by slicing the rebuilt solid. */
function solidAt(mesh: Mesh, x: number, y: number, z: number): boolean {
  const solid = new wasm.Manifold(mesh)
  const slice = solid.slice(z)
  const probe = wasm.CrossSection.square([0.1, 0.1], true)
  const placed = probe.translate([x, y])
  const hit = slice.intersect(placed)
  const area = hit.area()
  for (const value of [solid, slice, probe, placed, hit]) value.delete()
  return area > 0
}

const round = (overrides: Partial<MovementTrayConfig> = {}): MovementTrayConfig => ({
  ...defaultMovementTrayConfig(),
  shape: 'round',
  width: 25,
  length: 25,
  columns: 3,
  ranks: 2,
  ...overrides,
})

describe('movement tray layout', () => {
  it('fits five 25mm square bases across four ranks with clearance and a rim', () => {
    const layout = movementTrayLayout(defaultMovementTrayConfig())

    expect(layout).toMatchObject({ recessWidth: 127.5, recessLength: 102, width: 133.5, length: 108 })
  })

  it('places one slot per base in the unit', () => {
    expect(movementTrayLayout(defaultMovementTrayConfig()).slotCenters).toHaveLength(20)
  })

  it('keeps rank-and-file bases in contact across the frontage', () => {
    const { slotCenters } = movementTrayLayout(defaultMovementTrayConfig())

    expect(slotCenters[1].x - slotCenters[0].x).toBe(25.5)
  })

  it('keeps a printable web between round slots', () => {
    const { slotCenters } = movementTrayLayout(round())

    expect(slotCenters[1].x - slotCenters[0].x).toBeCloseTo(26.7, 6)
  })

  it('stands the floor on the slot depth', () => {
    expect(movementTrayHeight(defaultMovementTrayConfig())).toBe(5)
  })

  it('names the tray after its grid and base footprint', () => {
    expect({ rect: movementTrayName(defaultMovementTrayConfig()), round: movementTrayName(round({ width: 28.5 })) }).toEqual({
      rect: 'movement-tray-5x4-rect-25x25mm',
      round: 'movement-tray-3x2-round-28.5mm',
    })
  })

  it('needs a thicker floor to hold thicker magnets', () => {
    const config = defaultMovementTrayConfig()
    const thick = { ...config, magnets: { ...config.magnets, thickness: 3 } }

    expect(minimumMovementTrayFloor(thick) - minimumMovementTrayFloor(config)).toBeCloseTo(1, 6)
  })

  it('needs no magnet depth when pockets are off', () => {
    const config = defaultMovementTrayConfig()

    expect(minimumMovementTrayFloor({ ...config, magnets: { ...config.magnets, enabled: false } })).toBe(0.6)
  })
})

describe('buildMovementTray', () => {
  it('prints flat on the plate with slots opening upward', () => {
    const config = defaultMovementTrayConfig()
    const measured = bounds(buildMovementTray(wasm, config).mesh)

    expect({ minZ: measured.min[2], size: measured.size }).toEqual({ minZ: 0, size: [133.5, 108, 5] })
  })

  it('cuts one recess the size of the whole rank-and-file block', () => {
    const config = defaultMovementTrayConfig()
    const { mesh } = buildMovementTray(wasm, { ...config, magnets: { ...config.magnets, enabled: false } })
    const z = config.floorThickness + config.slotDepth / 2

    expect({
      insideEdge: solidAt(mesh, 127.5 / 2 - 0.2, 0, z),
      rim: solidAt(mesh, 127.5 / 2 + 0.2, 0, z),
      betweenBases: solidAt(mesh, 25.5 / 2, 0, z),
    }).toEqual({ insideEdge: false, rim: true, betweenBases: false })
  })

  it('separates round slots with a solid web', () => {
    const config = round()
    const { mesh } = buildMovementTray(wasm, config)
    const { slotCenters } = movementTrayLayout(config)
    const midpoint = (slotCenters[0].x + slotCenters[1].x) / 2

    const z = config.floorThickness + config.slotDepth / 2

    expect([-0.5, 0, 0.5].every((offset) => solidAt(mesh, midpoint + offset, slotCenters[0].y, z))).toBe(true)
  })

  it.for([
    ['square', defaultMovementTrayConfig()],
    ['round', round()],
    ['cavalry', { ...defaultMovementTrayConfig(), width: 25, length: 50, columns: 5, ranks: 2 }],
  ] as const)('welds cleanly as a %s tray', ([, config]) => {
    expect(duplicatePositions(buildMovementTray(wasm, config).mesh)).toBe(0)
  })

  it('opens a magnet pocket into every slot floor', () => {
    const config = defaultMovementTrayConfig()
    const { mesh } = buildMovementTray(wasm, config)
    const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
    const pocketMiddle = config.floorThickness - pocketDepth / 2
    const centers = movementTrayLayout(config).slotCenters.flatMap((slot) =>
      holderSlotMagnetCenters(config, config).map((magnet) => ({ x: slot.x + magnet.x, y: slot.y + magnet.y })),
    )

    expect(centers.filter((center) => !solidAt(mesh, center.x, center.y, pocketMiddle))).toHaveLength(20)
  })

  it('leaves floor beneath every magnet pocket', () => {
    const config = defaultMovementTrayConfig()
    const { mesh } = buildMovementTray(wasm, config)
    const pocketDepth = config.magnets.thickness + config.magnets.depthClearance
    const belowPocket = (config.floorThickness - pocketDepth) / 2

    expect(movementTrayLayout(config).slotCenters.every((slot) => solidAt(mesh, slot.x, slot.y, belowPocket))).toBe(true)
  })

  it('counts the shared magnet pattern for each base', () => {
    const config = { ...defaultMovementTrayConfig(), width: 50, length: 100, columns: 2, ranks: 1 }
    const perBase = holderSlotMagnetCenters(config, config).length

    expect({ perBase, total: movementTrayMagnetPocketCount(config) }).toEqual({ perBase: 2, total: 4 })
  })

  it('removes the pocket volume for every magnet', () => {
    const config = defaultMovementTrayConfig()
    const withMagnets = buildMovementTray(wasm, config).stats.volume
    const without = buildMovementTray(wasm, { ...config, magnets: { ...config.magnets, enabled: false } }).stats.volume
    const radius = (config.magnets.diameter + config.magnets.clearance) / 2
    const pocketVolume = Math.PI * radius ** 2 * (config.magnets.thickness + config.magnets.depthClearance)

    expect((without - withMagnets) / pocketVolume).toBeCloseTo(20, 0)
  })

  it('rejects a floor too thin to hold the magnets', () => {
    expect(() => buildMovementTray(wasm, { ...defaultMovementTrayConfig(), floorThickness: 2 })).toThrow(/floor/i)
  })

  it('rejects a rim too narrow to print', () => {
    expect(() => buildMovementTray(wasm, { ...defaultMovementTrayConfig(), rim: 0.5 })).toThrow(/rim/i)
  })
})
