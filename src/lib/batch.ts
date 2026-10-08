import { baseName, footprint } from '../geometry/outline'
import { footprintKey, resized } from '../geometry/presets'
import { maxProfileSize } from '../geometry/profile'
import type { BaseConfig } from '../geometry/types'
import { synchronizeWorkspace, type BatchEntry, type WorkspaceState } from './workspace'

const entryKey = (entry: Pick<BatchEntry, 'shape' | 'width' | 'length'>) => footprintKey(entry.shape, entry.width, entry.length)

/** Adds the current footprint, or one more of it when it is already listed. */
export function addToBatch(batch: BatchEntry[], config: BaseConfig): BatchEntry[] {
  const entry = { shape: config.shape, ...footprint(config), quantity: 1 }
  const key = entryKey(entry)
  return batch.some((existing) => entryKey(existing) === key)
    ? batch.map((existing) => (entryKey(existing) === key ? { ...existing, quantity: existing.quantity + 1 } : existing))
    : [...batch, entry]
}

/**
 * The current base resized to the entry's footprint exactly as typing that size
 * would, so per-footprint magnet counts and overrides apply. Custom label text
 * names the current size, so other sizes fall back to their own.
 */
export function batchBaseConfig(workspace: WorkspaceState, entry: BatchEntry): BaseConfig {
  const current = workspace.base
  if (entryKey(entry) === footprintKey(current.shape, current.width, current.length)) return current
  const next = resized({ ...current, shape: entry.shape }, entry.width, entry.length)
  const { base } = synchronizeWorkspace({ ...workspace, base: { ...next, label: { ...next.label, text: undefined } } })
  return { ...base, profileSize: Math.min(base.profileSize, maxProfileSize(base)) }
}

export const batchFileName = (config: BaseConfig, quantity: number) => `${baseName(config)}-x${quantity}`

export const batchName = (batch: BatchEntry[]) => `base-batch-${batch.reduce((total, entry) => total + entry.quantity, 0)}`
