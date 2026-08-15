import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { splitMeshComponents, to3mf, type MeshLike } from './exporters'

const disconnectedTriangles: MeshLike = {
  numProp: 3,
  vertProperties: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]),
  triVerts: Uint32Array.from([0, 1, 2, 3, 4, 5]),
}

describe('3MF objects', () => {
  it('splits disconnected printable bodies into top-level objects', () => {
    const parts = splitMeshComponents(disconnectedTriangles)
    expect(parts).toHaveLength(2)
    expect(parts.every((part) => part.triVerts.length === 3 && part.vertProperties.length === 9)).toBe(true)

    const archive = unzipSync(to3mf(parts.map((mesh, index) => ({ mesh, name: `part-${index + 1}` }))))
    const model = new TextDecoder().decode(archive['3D/3dmodel.model'])
    expect(model.match(/<object /g)).toHaveLength(2)
    expect(model.match(/<item /g)).toHaveLength(2)
    expect(model).toContain('name="part-1"')
    expect(model).toContain('name="part-2"')
  })
})
