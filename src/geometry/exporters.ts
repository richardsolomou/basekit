import { zipSync } from 'fflate'

/** The slice of a Manifold mesh the exporters need, so they also work on worker output. */
export interface MeshLike {
  numProp: number
  vertProperties: Float32Array
  triVerts: Uint32Array
}

/** Binary STL. Slicers all read it, so it stays the default despite losing topology. */
export function toStl(mesh: MeshLike, header = 'mini-bases'): Uint8Array {
  const triangles = mesh.triVerts.length / 3
  const out = new DataView(new ArrayBuffer(84 + triangles * 50))
  new Uint8Array(out.buffer).set(new TextEncoder().encode(header.slice(0, 80)))
  out.setUint32(80, triangles, true)

  const { numProp, vertProperties: v, triVerts: t } = mesh
  for (let i = 0; i < triangles; i++) {
    const o = 84 + i * 50
    const [a, b, c] = [t[i * 3] * numProp, t[i * 3 + 1] * numProp, t[i * 3 + 2] * numProp]
    const ux = v[b] - v[a]
    const uy = v[b + 1] - v[a + 1]
    const uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a]
    const wy = v[c + 1] - v[a + 1]
    const wz = v[c + 2] - v[a + 2]
    const nx = uy * wz - uz * wy
    const ny = uz * wx - ux * wz
    const nz = ux * wy - uy * wx
    const len = Math.hypot(nx, ny, nz) || 1
    out.setFloat32(o, nx / len, true)
    out.setFloat32(o + 4, ny / len, true)
    out.setFloat32(o + 8, nz / len, true)
    for (const [j, base] of [a, b, c].entries()) {
      out.setFloat32(o + 12 + j * 12, v[base], true)
      out.setFloat32(o + 16 + j * 12, v[base + 1], true)
      out.setFloat32(o + 20 + j * 12, v[base + 2], true)
    }
  }
  return new Uint8Array(out.buffer)
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`

function modelXml(meshes: { mesh: MeshLike; name: string }[]): string {
  const objects = meshes.map(({ mesh, name }, index) => {
    const { numProp, vertProperties: v, triVerts: t } = mesh
    const vertices: string[] = []
    for (let i = 0; i < v.length; i += numProp) {
      vertices.push(`<vertex x="${v[i]}" y="${v[i + 1]}" z="${v[i + 2]}"/>`)
    }
    const triangles: string[] = []
    for (let i = 0; i < t.length; i += 3) {
      triangles.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`)
    }
    return `<object id="${index + 1}" type="model" name="${name}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`
  })
  const items = meshes.map((_, index) => `<item objectid="${index + 1}"/>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">Mini Bases</metadata>
<resources>${objects.join('')}</resources>
<build>${items.join('')}</build>
</model>`
}

/** 3MF keeps the mesh topology intact and carries millimetre units explicitly. */
export function to3mf(meshes: { mesh: MeshLike; name: string }[]): Uint8Array {
  const enc = new TextEncoder()
  return zipSync({
    '[Content_Types].xml': enc.encode(CONTENT_TYPES),
    _rels: { '.rels': enc.encode(RELS) },
    '3D': { '3dmodel.model': enc.encode(modelXml(meshes)) },
  })
}
