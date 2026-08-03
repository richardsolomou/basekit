import type { PartConfig } from '@/geometry/types'
import type { MeshData, WorkerReply, WorkerRequest } from '@/worker/protocol'

/** Builds one mesh in an isolated worker, used by exports without replacing the preview. */
export function buildMesh(config: PartConfig): Promise<MeshData> {
  const worker = new Worker(new URL('../worker/base.worker.ts', import.meta.url), { type: 'module' })
  const id = 1

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      if (reply.id !== id) return
      worker.terminate()
      if (reply.kind === 'error') reject(new Error(reply.message))
      else resolve(reply.mesh)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }
    worker.postMessage({ id, config } satisfies WorkerRequest)
  })
}
