import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { parse, type Font } from 'opentype.js'
import fontUrl from '@/assets/fonts/oswald-700.woff?url'
import { buildBase, type BuildResult } from '@/geometry/base'
import { loadManifold } from '@/geometry/manifold'
import type { MeshData, WorkerReply, WorkerRequest } from './protocol'

const ready = Promise.all([
  loadManifold(() => wasmUrl),
  fetch(fontUrl)
    .then((r) => r.arrayBuffer())
    .then(parse) as Promise<Font>,
])

/** Copies out of the mesh: its arrays may still view WASM memory, which must not be transferred. */
function toMeshData(result: BuildResult): MeshData {
  const { mesh } = result
  return { positions: new Float32Array(mesh.vertProperties), indices: new Uint32Array(mesh.triVerts) }
}

const send = (reply: WorkerReply, transfer: ArrayBufferLike[]) => self.postMessage(reply, { transfer: transfer as Transferable[] })

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, config } = event.data
  try {
    const [wasm, font] = await ready
    const mesh = toMeshData(buildBase(wasm, config, font))
    send({ id, kind: 'mesh', mesh }, [mesh.positions.buffer, mesh.indices.buffer])
  } catch (error) {
    send({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
}
