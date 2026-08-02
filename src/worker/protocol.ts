import type { BaseConfig } from '@/geometry/types'

export interface MeshData {
  positions: Float32Array
  indices: Uint32Array
}

/** One config in, one preview out; there is nothing else to ask the worker for. */
export interface WorkerRequest {
  id: number
  config: BaseConfig
}

export type WorkerReply = { id: number; kind: 'preview'; mesh: MeshData } | { id: number; kind: 'error'; message: string }
