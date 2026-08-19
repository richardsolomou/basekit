import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { arrangeMeshesOnPlates, splitMeshComponents, to3mf, type MeshLike } from './exporters'

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

  it('auto-arranges top-level objects onto 180mm plates', () => {
    const parts = splitMeshComponents(disconnectedTriangles).map((mesh, index) => ({ mesh, name: `part-${index + 1}` }))
    const arranged = arrangeMeshesOnPlates(parts)
    expect(new Set(arranged.map(({ plate }) => plate))).toEqual(new Set([0]))
    for (const { mesh } of arranged) {
      const x = Array.from(mesh.vertProperties.filter((_, index) => index % mesh.numProp === 0))
      const y = Array.from(mesh.vertProperties.filter((_, index) => index % mesh.numProp === 1))
      expect(Math.min(...x)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...x)).toBeLessThanOrEqual(180)
      expect(Math.min(...y)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...y)).toBeLessThanOrEqual(180)
    }

    const archive = unzipSync(to3mf(parts, true, 180))
    const settings = new TextDecoder().decode(archive['Metadata/model_settings.config'])
    const project = JSON.parse(new TextDecoder().decode(archive['Metadata/project_settings.config']))
    expect(settings.match(/<plate>/g)).toHaveLength(1)
    expect(settings.match(/<model_instance>/g)).toHaveLength(2)
    expect(project.printer_settings_id).toBe('Bambu Lab A1 mini 0.4 nozzle')
  })
})
