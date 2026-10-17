import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { packPlates, to3mfPlates, type MeshLike } from './exporters'

const PLATE = 256

/** A flat stand-in with the given footprint, deliberately off the origin like a centred base. */
function slab(width: number, length: number): MeshLike {
  const x = -width / 2
  const y = -length / 2
  return {
    numProp: 3,
    vertProperties: new Float32Array([x, y, 0, x + width, y, 0, x, y + length, 0, x + width, y + length, 3]),
    triVerts: new Uint32Array([0, 1, 2, 1, 3, 2]),
  }
}

const overlaps = (a: { x: number; y: number; w: number; l: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.l && b.y < a.y + a.l

describe('packPlates', () => {
  const meshes = [slab(32, 32), slab(60, 35)]
  const sizes = [
    { w: 32, l: 32 },
    { w: 60, l: 35 },
  ]

  it('places every copy', () => {
    expect(packPlates(meshes, [10, 3]).flat()).toHaveLength(13)
  })

  it('keeps every copy on its build plate', () => {
    const items = packPlates(meshes, [40, 12]).flat()
    expect(items.every(({ object, x, y }) => x >= 0 && y >= 0 && x + sizes[object].w <= PLATE && y + sizes[object].l <= PLATE)).toBe(true)
  })

  it('never overlaps two copies on one plate', () => {
    const plates = packPlates(meshes, [40, 12]).map((items) => items.map(({ object, x, y }) => ({ x, y, ...sizes[object] })))
    expect(plates.every((boxes) => boxes.every((a, i) => boxes.every((b, j) => i === j || !overlaps(a, b))))).toBe(true)
  })

  it('fits a handful of bases on one plate', () => {
    expect(packPlates(meshes, [10, 3])).toHaveLength(1)
  })

  it('spills onto more plates when one is full', () => {
    expect(packPlates([slab(100, 100)], [5])).toHaveLength(2)
  })
})

describe('to3mfPlates', () => {
  const meshes = [
    { mesh: slab(32, 32), name: 'base-round-32mm' },
    { mesh: slab(40, 40), name: 'base-round-40mm' },
  ]
  const archive = unzipSync(
    to3mfPlates(meshes, [
      {
        name: 'plate-1',
        items: [
          { object: 0, x: 10, y: 10 },
          { object: 0, x: 50, y: 10 },
        ],
      },
      { name: 'plate-2', items: [{ object: 1, x: 10, y: 10 }] },
    ]),
  )
  const model = new TextDecoder().decode(archive['3D/3dmodel.model'])
  const settings = new TextDecoder().decode(archive['Metadata/model_settings.config'])

  it('stores each size once', () => {
    expect(model.match(/<object /g)).toHaveLength(2)
  })

  it('places a build item for every copy', () => {
    expect(model.match(/<item objectid="2"/g)).toHaveLength(2)
  })

  it('numbers the copies of an object as its instances', () => {
    expect(settings).toContain('<assemble_item object_id="2" instance_id="1"')
  })

  it('assigns each copy to its own plate', () => {
    const plates = settings.split('<plate>').slice(1)
    expect(plates.map((plate) => plate.match(/<model_instance>/g)?.length)).toEqual([2, 1])
  })

  it('moves each copy to its corner on its plate', () => {
    expect(model).toContain('transform="1 0 0 0 1 0 0 0 1 66 26 0"')
  })
})
