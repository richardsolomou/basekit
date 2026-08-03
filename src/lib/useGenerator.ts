import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartConfig } from '@/geometry/types'
import type { MeshData, WorkerReply, WorkerRequest } from '@/worker/protocol'

/**
 * Owns the geometry worker. Previews supersede one another: dragging a dimension
 * only ever renders the newest config, and every reply is a finished preview, so
 * nothing here reports a pending state.
 */
export function useGenerator(config: PartConfig) {
  const worker = useRef<Worker>(null)
  const nextId = useRef(0)
  const latestPreview = useRef(0)
  const building = useRef(false)
  const queued = useRef<PartConfig>(undefined)

  const [preview, setPreview] = useState<MeshData>()
  const [error, setError] = useState<string>()

  /** Sends one config and remembers it is the one whose reply matters. */
  const send = useCallback((next: PartConfig) => {
    const id = ++nextId.current
    latestPreview.current = id
    building.current = true
    worker.current?.postMessage({ id, config: next } satisfies WorkerRequest)
  }, [])

  /** Called on every reply: start the newest config that arrived while busy. */
  const drain = useCallback(() => {
    building.current = false
    const next = queued.current
    queued.current = undefined
    if (next) send(next)
  }, [send])

  useEffect(() => {
    const instance = new Worker(new URL('../worker/geometry.worker.ts', import.meta.url), { type: 'module' })
    worker.current = instance
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      if (reply.id !== latestPreview.current) return // a newer config is already in flight
      if (reply.kind === 'error') {
        setError(reply.message)
      } else {
        setPreview(reply.mesh)
        setError(undefined)
      }
      drain()
    }
    return () => instance.terminate()
  }, [drain])

  // No debounce: a build is started the moment the worker is free, and while it is
  // busy only the newest config is held. Waiting for changes to stop meant nothing
  // rendered at all until a drag ended.
  useEffect(() => {
    if (building.current) queued.current = config
    else send(config)
  }, [config, send])

  return { preview, error }
}
