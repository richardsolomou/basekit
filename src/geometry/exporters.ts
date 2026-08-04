import { zipSync } from 'fflate'

/** The slice of a Manifold mesh the exporters need, so they also work on worker output. */
export interface MeshLike {
  numProp: number
  vertProperties: Float32Array
  triVerts: Uint32Array
}

/** Binary STL. Slicers all read it, so it stays the default despite losing topology. */
export function toStl(mesh: MeshLike, header = 'BaseKit'): Uint8Array {
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

const PROJECT_SETTINGS = JSON.stringify({
  filament_settings_id: ['Bambu PLA Basic @BBL X1C'],
  print_settings_id: '0.20mm Standard @BBL X1C',
  printer_settings_id: 'Bambu Lab X1 Carbon 0.4 nozzle',
})
const PLATE_SIZE = 256
const PLATE_STRIDE = PLATE_SIZE * 1.2
const PLATE_MARGIN = 30

function meshXml(mesh: MeshLike): string {
  const { numProp, vertProperties: v, triVerts: t } = mesh
  const vertices: string[] = []
  for (let i = 0; i < v.length; i += numProp) {
    vertices.push(`<vertex x="${v[i]}" y="${v[i + 1]}" z="${v[i + 2]}"/>`)
  }
  const triangles: string[] = []
  for (let i = 0; i < t.length; i += 3) {
    triangles.push(`<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`)
  }
  return `<mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh>`
}

function placement(mesh: MeshLike, index: number, count: number): string {
  const { numProp, vertProperties: vertices } = mesh
  let minX = Infinity
  let minY = Infinity
  for (let i = 0; i < vertices.length; i += numProp) {
    minX = Math.min(minX, vertices[i])
    minY = Math.min(minY, vertices[i + 1])
  }
  const columns = Math.ceil(Math.sqrt(count))
  const column = index % columns
  const row = Math.floor(index / columns)
  return `1 0 0 0 1 0 0 0 1 ${PLATE_MARGIN - minX + column * PLATE_STRIDE} ${PLATE_MARGIN - minY - row * PLATE_STRIDE} 0`
}

function modelXml(meshes: { mesh: MeshLike; name: string }[], separateBuildPlates: boolean): string {
  if (!separateBuildPlates) {
    const objects = meshes.map(({ mesh, name }, index) => `<object id="${index + 1}" type="model" name="${name}">${meshXml(mesh)}</object>`)
    const items = meshes.map((_, index) => `<item objectid="${index + 1}"/>`)
    return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">BaseKit</metadata>
<resources>${objects.join('')}</resources>
<build>${items.join('')}</build>
</model>`
  }

  const objects = meshes.map(({ name }, index) => {
    const objectId = (index + 1) * 2
    const partId = objectId - 1
    const uuid = (index + 1).toString(16).padStart(8, '0')
    const partUuid = `${(index + 1).toString(16).padStart(4, '0')}0000`
    return `<object id="${objectId}" p:UUID="${uuid}-61cb-4c03-9d28-80fed5dfa1dc" type="model" name="${name}"><components><component p:path="/3D/Objects/object_${index + 1}.model" objectid="${partId}" p:UUID="${partUuid}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components></object>`
  })
  const items = meshes.map(({ mesh }, index) => {
    const objectId = (index + 1) * 2
    const uuid = objectId.toString(16).padStart(8, '0')
    return `<item objectid="${objectId}" p:UUID="${uuid}-b1ec-4553-aec9-835e5b724bb4" transform="${placement(mesh, index, meshes.length)}" printable="1"/>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
<metadata name="Application">BambuStudio-02.07.01.62</metadata>
<metadata name="BambuStudio:3mfVersion">1</metadata>
<metadata name="Designer">BaseKit</metadata>
<resources>${objects.join('')}</resources>
<build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">${items.join('')}</build>
</model>`
}

function objectModelXml(mesh: MeshLike, index: number): string {
  const objectId = index * 2 + 1
  const uuid = `${(index + 1).toString(16).padStart(4, '0')}0000`
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
<metadata name="BambuStudio:3mfVersion">1</metadata>
<resources><object id="${objectId}" p:UUID="${uuid}-81cb-4c03-9d28-80fed5dfa1dc" type="model">${meshXml(mesh)}</object></resources>
<build/>
</model>`
}

function modelRelationshipsXml(count: number): string {
  const relationships = Array.from(
    { length: count },
    (_, index) =>
      `<Relationship Target="/3D/Objects/object_${index + 1}.model" Id="rel-${index + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`
}

function plateSettingsXml(meshes: { mesh: MeshLike; name: string }[]): string {
  const objects = meshes.map(({ mesh, name }, index) => {
    const objectId = (index + 1) * 2
    const partId = objectId - 1
    return `<object id="${objectId}"><metadata key="name" value="${name}"/><metadata key="extruder" value="1"/><part id="${partId}" subtype="normal_part"><metadata key="name" value="${name}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><mesh_stat face_count="${mesh.triVerts.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part></object>`
  })
  const plates = meshes.map(
    ({ name }, index) => `<plate>
<metadata key="plater_id" value="${index + 1}"/>
<metadata key="plater_name" value="${name}"/>
<metadata key="locked" value="false"/>
<model_instance>
<metadata key="object_id" value="${(index + 1) * 2}"/>
<metadata key="instance_id" value="0"/>
<metadata key="identify_id" value="${index + 1}"/>
</model_instance>
</plate>`,
  )
  const assembly = meshes.map(
    ({ mesh }, index) =>
      `<assemble_item object_id="${(index + 1) * 2}" instance_id="0" transform="${placement(mesh, index, meshes.length)}" offset="0 0 0"/>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objects.join('\n')}
${plates.join('\n')}
<assemble>${assembly.join('')}</assemble>
</config>`
}

/** 3MF keeps the mesh topology intact and carries millimetre units explicitly. */
export function to3mf(meshes: { mesh: MeshLike; name: string }[], separateBuildPlates = false): Uint8Array {
  const enc = new TextEncoder()
  const objectModels = Object.fromEntries(
    meshes.map(({ mesh }, index) => [`object_${index + 1}.model`, enc.encode(objectModelXml(mesh, index))]),
  )
  const files = {
    '[Content_Types].xml': enc.encode(CONTENT_TYPES),
    _rels: { '.rels': enc.encode(RELS) },
    '3D': {
      '3dmodel.model': enc.encode(modelXml(meshes, separateBuildPlates)),
      ...(separateBuildPlates
        ? { Objects: objectModels, _rels: { '3dmodel.model.rels': enc.encode(modelRelationshipsXml(meshes.length)) } }
        : {}),
    },
    ...(separateBuildPlates
      ? {
          Metadata: {
            'model_settings.config': enc.encode(plateSettingsXml(meshes)),
            'project_settings.config': enc.encode(PROJECT_SETTINGS),
          },
        }
      : {}),
  }
  return zipSync(files)
}
