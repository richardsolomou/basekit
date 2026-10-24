import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { parse, type Font } from 'opentype.js'
import fontUrl from '@/assets/fonts/oswald-700.woff?url'
import { buildBase, type BuildResult } from '@/core/geometry/base'
import { buildHolder } from '@/core/geometry/holder'
import { loadManifold } from '@/core/geometry/manifold'
import { buildMovementTray } from '@/core/geometry/movementTray'
import { buildToken } from '@/core/geometry/token'
import { buildPaintingHandle, buildPaintingTray } from '@/core/geometry/paintingTray'
import { buildPaintRack } from '@/core/geometry/paintRack'
import { buildFlightStem } from '@/core/geometry/stem'
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
    const result =
      config.kind === 'holder'
        ? buildHolder(wasm, config, font)
        : config.kind === 'movement-tray'
          ? buildMovementTray(wasm, config)
          : config.kind === 'painting-handle'
            ? buildPaintingHandle(wasm, config)
            : config.kind === 'painting-tray'
              ? buildPaintingTray(wasm, config)
              : config.kind === 'paint-rack'
                ? buildPaintRack(wasm, config)
                : config.kind === 'stem'
                  ? buildFlightStem(wasm, config)
                  : config.kind === 'token'
                    ? buildToken(wasm, config, font)
                    : buildBase(wasm, config, font)
    const mesh = toMeshData(result)
    send({ id, kind: 'mesh', mesh, grams: result.stats.grams }, [mesh.positions.buffer, mesh.indices.buffer])
  } catch (error) {
    send({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
}
