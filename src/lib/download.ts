export function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Worker meshes arrive as flat arrays; the exporters expect the Manifold layout. */
export function asMeshLike(mesh: { positions: Float32Array; indices: Uint32Array }) {
  return { numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }
}
