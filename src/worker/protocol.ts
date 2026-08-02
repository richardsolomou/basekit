import type { BaseConfig, BaseStats } from '@/geometry/types'

export interface MeshData {
  positions: Float32Array
  indices: Uint32Array
}

export type WorkerRequest = { id: number; kind: 'preview'; config: BaseConfig } | { id: number; kind: 'pack'; configs: BaseConfig[] }

export type WorkerReply =
  | { id: number; kind: 'preview'; mesh: MeshData; stats: BaseStats }
  | { id: number; kind: 'pack'; parts: { name: string; mesh: MeshData; stats: BaseStats }[] }
  | { id: number; kind: 'error'; message: string }
