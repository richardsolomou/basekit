import ManifoldModule from 'manifold-3d'
import type { ManifoldToplevel } from 'manifold-3d'

let pending: Promise<ManifoldToplevel> | undefined

/**
 * Loads the WASM module once per thread. `locateWasm` lets the caller hand over
 * a bundled asset URL; Node resolves the file on its own.
 */
export function loadManifold(locateWasm?: () => string): Promise<ManifoldToplevel> {
  pending ??= (locateWasm ? ManifoldModule({ locateFile: locateWasm }) : ManifoldModule()).then((wasm) => {
    wasm.setup()
    return wasm
  })
  return pending
}
