import { zipSync } from 'fflate'

/** The slice of a Manifold mesh the exporters need, so they also work on worker output. */
export interface MeshLike {
  numProp: number
  vertProperties: Float32Array
  triVerts: Uint32Array
}

/** Split a multi-body mesh into independently selectable connected objects. */
export function splitMeshComponents(mesh: MeshLike): MeshLike[] {
  const vertexCount = mesh.vertProperties.length / mesh.numProp
  const parent = Int32Array.from({ length: vertexCount }, (_, index) => index)
  const find = (start: number): number => {
    let root = start
    while (parent[root] !== root) root = parent[root]
    let current = start
    while (parent[current] !== current) {
      const next = parent[current]
      parent[current] = root
      current = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }
  for (let index = 0; index < mesh.triVerts.length; index += 3) {
    union(mesh.triVerts[index], mesh.triVerts[index + 1])
    union(mesh.triVerts[index], mesh.triVerts[index + 2])
  }

  const triangles = new Map<number, number[]>()
  for (let index = 0; index < mesh.triVerts.length; index += 3) {
    const group = find(mesh.triVerts[index])
    const values = triangles.get(group) ?? []
    values.push(mesh.triVerts[index], mesh.triVerts[index + 1], mesh.triVerts[index + 2])
    triangles.set(group, values)
  }

  return [...triangles.values()].map((sourceTriangles) => {
    const oldToNew = new Map<number, number>()
    const properties: number[] = []
    const localTriangles = sourceTriangles.map((sourceVertex) => {
      const existing = oldToNew.get(sourceVertex)
      if (existing !== undefined) return existing
      const local = oldToNew.size
      oldToNew.set(sourceVertex, local)
      const offset = sourceVertex * mesh.numProp
      for (let property = 0; property < mesh.numProp; property++) properties.push(mesh.vertProperties[offset + property])
      return local
    })
    return {
      numProp: mesh.numProp,
      vertProperties: Float32Array.from(properties),
      triVerts: Uint32Array.from(localTriangles),
    }
  })
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
const AUTO_PROJECT_SETTINGS = JSON.stringify({
  filament_settings_id: ['Bambu PLA Basic @BBL A1M'],
  print_settings_id: '0.20mm Standard @BBL A1M',
  printer_settings_id: 'Bambu Lab A1 mini 0.4 nozzle',
})
const PLATE_SIZE = 256
const PLATE_STRIDE = PLATE_SIZE * 1.2
const PLATE_MARGIN = 30
const AUTO_PLATE_MARGIN = 3
const AUTO_PLATE_GAP = 3

interface ArrangedPart {
  mesh: MeshLike
  name: string
  plate: number
}

function meshBounds(mesh: MeshLike) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index < mesh.vertProperties.length; index += mesh.numProp) {
    minX = Math.min(minX, mesh.vertProperties[index])
    minY = Math.min(minY, mesh.vertProperties[index + 1])
    maxX = Math.max(maxX, mesh.vertProperties[index])
    maxY = Math.max(maxY, mesh.vertProperties[index + 1])
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function rotateMesh(mesh: MeshLike, degrees: number): MeshLike {
  const angle = (degrees * Math.PI) / 180
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const vertices = Float32Array.from(mesh.vertProperties)
  for (let index = 0; index < vertices.length; index += mesh.numProp) {
    const x = vertices[index]
    const y = vertices[index + 1]
    vertices[index] = x * cosine - y * sine
    vertices[index + 1] = x * sine + y * cosine
  }
  return { ...mesh, vertProperties: vertices }
}

function translateMesh(mesh: MeshLike, x: number, y: number): MeshLike {
  const vertices = Float32Array.from(mesh.vertProperties)
  for (let index = 0; index < vertices.length; index += mesh.numProp) {
    vertices[index] += x
    vertices[index + 1] += y
  }
  return { ...mesh, vertProperties: vertices }
}

/** Pack independent objects onto conservative 180mm-class build plates. */
export function arrangeMeshesOnPlates(meshes: { mesh: MeshLike; name: string }[], plateSize = 180): ArrangedPart[] {
  const usable = plateSize - AUTO_PLATE_MARGIN * 2
  const candidates = meshes.map((part) => {
    const orientations = [0, 90, 45, -45].map((degrees) => {
      const mesh = degrees === 0 ? part.mesh : rotateMesh(part.mesh, degrees)
      return { mesh, bounds: meshBounds(mesh), degrees }
    })
    const fitting = orientations.filter(({ bounds }) => bounds.width <= usable && bounds.height <= usable)
    if (fitting.length === 0) throw new Error(`${part.name} is too large for the automatic ${plateSize}mm plate layout`)
    const chosen = fitting.sort((a, b) => Math.abs(a.degrees) - Math.abs(b.degrees) || a.bounds.height - b.bounds.height)[0]
    return { ...part, ...chosen }
  })
  candidates.sort((a, b) => b.bounds.height - a.bounds.height || b.bounds.width - a.bounds.width)

  const plates: { rows: { y: number; height: number; x: number }[] }[] = []
  const arranged: ArrangedPart[] = []
  for (const part of candidates) {
    let target: { plate: number; row: { y: number; height: number; x: number } } | undefined
    for (let plate = 0; plate < plates.length && !target; plate++) {
      for (const row of plates[plate].rows) {
        if (part.bounds.height <= row.height && row.x + part.bounds.width <= plateSize - AUTO_PLATE_MARGIN) {
          target = { plate, row }
          break
        }
      }
      if (!target) {
        const rows = plates[plate].rows
        const y = rows.length === 0 ? AUTO_PLATE_MARGIN : rows.at(-1)!.y + rows.at(-1)!.height + AUTO_PLATE_GAP
        if (y + part.bounds.height <= plateSize - AUTO_PLATE_MARGIN) {
          const row = { y, height: part.bounds.height, x: AUTO_PLATE_MARGIN }
          rows.push(row)
          target = { plate, row }
        }
      }
    }
    if (!target) {
      const row = { y: AUTO_PLATE_MARGIN, height: part.bounds.height, x: AUTO_PLATE_MARGIN }
      plates.push({ rows: [row] })
      target = { plate: plates.length - 1, row }
    }
    const x = target.row.x
    const y = target.row.y
    target.row.x += part.bounds.width + AUTO_PLATE_GAP
    arranged.push({
      name: part.name,
      plate: target.plate,
      mesh: translateMesh(part.mesh, x - part.bounds.minX, y - part.bounds.minY),
    })
  }
  return arranged
}

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

function modelXml(meshes: { mesh: MeshLike; name: string }[], separateBuildPlates: boolean, prepositioned = false): string {
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
    const transform = prepositioned ? '1 0 0 0 1 0 0 0 1 0 0 0' : placement(mesh, index, meshes.length)
    return `<item objectid="${objectId}" p:UUID="${uuid}-b1ec-4553-aec9-835e5b724bb4" transform="${transform}" printable="1"/>`
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

function plateSettingsXml(meshes: { mesh: MeshLike; name: string }[], plateAssignments?: number[], prepositioned = false): string {
  const objects = meshes.map(({ mesh, name }, index) => {
    const objectId = (index + 1) * 2
    const partId = objectId - 1
    return `<object id="${objectId}"><metadata key="name" value="${name}"/><metadata key="extruder" value="1"/><part id="${partId}" subtype="normal_part"><metadata key="name" value="${name}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><mesh_stat face_count="${mesh.triVerts.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part></object>`
  })
  const plateCount = plateAssignments === undefined ? meshes.length : Math.max(...plateAssignments) + 1
  const plates = Array.from({ length: plateCount }, (_unusedPlate, plate) => {
    const indices = meshes.flatMap((_unusedMesh, index) =>
      plateAssignments?.[index] === plate || (plateAssignments === undefined && index === plate) ? [index] : [],
    )
    return `<plate>
<metadata key="plater_id" value="${plate + 1}"/>
<metadata key="plater_name" value="${plateAssignments === undefined ? meshes[plate].name : `Plate ${plate + 1}`}"/>
<metadata key="locked" value="false"/>
${indices
  .map(
    (index) => `<model_instance>
<metadata key="object_id" value="${(index + 1) * 2}"/>
<metadata key="instance_id" value="0"/>
<metadata key="identify_id" value="${index + 1}"/>
</model_instance>`,
  )
  .join('\n')}
</plate>`
  })
  const assembly = meshes.map(({ mesh }, index) => {
    const transform = prepositioned ? '1 0 0 0 1 0 0 0 1 0 0 0' : placement(mesh, index, meshes.length)
    return `<assemble_item object_id="${(index + 1) * 2}" instance_id="0" transform="${transform}" offset="0 0 0"/>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objects.join('\n')}
${plates.join('\n')}
<assemble>${assembly.join('')}</assemble>
</config>`
}

/** 3MF keeps the mesh topology intact and carries millimetre units explicitly. */
export function to3mf(meshes: { mesh: MeshLike; name: string }[], separateBuildPlates = false, autoPlateSize?: number): Uint8Array {
  const arranged = autoPlateSize === undefined ? undefined : arrangeMeshesOnPlates(meshes, autoPlateSize)
  const exportedMeshes = arranged?.map(({ mesh, name }) => ({ mesh, name })) ?? meshes
  const plateAssignments = arranged?.map(({ plate }) => plate)
  separateBuildPlates ||= autoPlateSize !== undefined
  const enc = new TextEncoder()
  const objectModels = Object.fromEntries(
    exportedMeshes.map(({ mesh }, index) => [`object_${index + 1}.model`, enc.encode(objectModelXml(mesh, index))]),
  )
  const files = {
    '[Content_Types].xml': enc.encode(CONTENT_TYPES),
    _rels: { '.rels': enc.encode(RELS) },
    '3D': {
      '3dmodel.model': enc.encode(modelXml(exportedMeshes, separateBuildPlates, arranged !== undefined)),
      ...(separateBuildPlates
        ? { Objects: objectModels, _rels: { '3dmodel.model.rels': enc.encode(modelRelationshipsXml(meshes.length)) } }
        : {}),
    },
    ...(separateBuildPlates
      ? {
          Metadata: {
            'model_settings.config': enc.encode(plateSettingsXml(exportedMeshes, plateAssignments, arranged !== undefined)),
            'project_settings.config': enc.encode(arranged === undefined ? PROJECT_SETTINGS : AUTO_PROJECT_SETTINGS),
          },
        }
      : {}),
  }
  return zipSync(files)
}
