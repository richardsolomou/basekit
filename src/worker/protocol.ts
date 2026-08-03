import type { PartConfig } from '@/geometry/types'

export interface MeshData {
  positions: Float32Array
  indices: Uint32Array
}

/** One config in, one preview out; there is nothing else to ask the worker for. */
export interface WorkerRequest {
  id: number
  config: PartConfig
}

export type WorkerReply = { id: number; kind: 'mesh'; mesh: MeshData } | { id: number; kind: 'error'; message: string }
