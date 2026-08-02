import { useCallback, useEffect, useRef, useState } from 'react'
import type { BaseConfig, BaseStats } from '@/geometry/types'
import type { MeshData, WorkerReply, WorkerRequest } from '@/worker/protocol'

export interface PackPart {
  name: string
  mesh: MeshData
  stats: BaseStats
}

interface Preview {
  mesh: MeshData
  stats: BaseStats
}

/**
 * Owns the geometry worker. Previews are debounced and superseded — dragging a
 * slider only ever renders the newest config.
 */
export function useGenerator(config: BaseConfig) {
  const worker = useRef<Worker>(null)
  const nextId = useRef(0)
  const latestPreview = useRef(0)
  const packResolvers = useRef(new Map<number, (parts: PackPart[]) => void>())

  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    const instance = new Worker(new URL('../worker/base.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      if (reply.kind === 'error') {
        if (reply.id === latestPreview.current) {
          setError(reply.message)
          setBusy(false)
        }
        packResolvers.current.get(reply.id)?.([])
        packResolvers.current.delete(reply.id)
        return
      }
      if (reply.kind === 'preview') {
        if (reply.id !== latestPreview.current) return // a newer config is already in flight
        setPreview({ mesh: reply.mesh, stats: reply.stats })
        setError(undefined)
        setBusy(false)
        return
      }
      packResolvers.current.get(reply.id)?.(reply.parts)
      packResolvers.current.delete(reply.id)
    }
    return () => instance.terminate()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const id = ++nextId.current
      latestPreview.current = id
      setBusy(true)
      worker.current?.postMessage({ id, kind: 'preview', config } satisfies WorkerRequest)
    }, 60)
    return () => clearTimeout(timer)
  }, [config])

  const buildPack = useCallback((configs: BaseConfig[]) => {
    const id = ++nextId.current
    return new Promise<PackPart[]>((resolve) => {
      packResolvers.current.set(id, resolve)
      worker.current?.postMessage({ id, kind: 'pack', configs } satisfies WorkerRequest)
    })
  }, [])

  return { preview, error, busy, buildPack }
}
