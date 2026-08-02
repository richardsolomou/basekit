import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { parse, type Font } from 'opentype.js'
import fontUrl from '@/assets/fonts/oswald-700.woff?url'
import { buildBase, type BuildResult } from '@/geometry/base'
import { loadManifold } from '@/geometry/manifold'
import { baseName } from '@/geometry/outline'
import type { BaseConfig } from '@/geometry/types'
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
  const request = event.data
  try {
    const [wasm, font] = await ready
    const build = (config: BaseConfig) => buildBase(wasm, config, font)

    if (request.kind === 'preview') {
      const result = build(request.config)
      const mesh = toMeshData(result)
      send({ id: request.id, kind: 'preview', mesh, stats: result.stats }, [mesh.positions.buffer, mesh.indices.buffer])
      return
    }

    const parts = request.configs.map((config) => {
      const result = build(config)
      return { name: baseName(config), mesh: toMeshData(result), stats: result.stats }
    })
    send(
      { id: request.id, kind: 'pack', parts },
      parts.flatMap((p) => [p.mesh.positions.buffer, p.mesh.indices.buffer]),
    )
  } catch (error) {
    send({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
}
