import { describe, expect, it } from 'vitest'
import { automaticMagnetCount, footprintKey, OVAL_SIZES, presetFor } from '../geometry/presets'
import { addToBatch, batchBaseConfig, batchFileName, batchName } from './batch'
import { defaultWorkspace, synchronizeWorkspace, type BatchEntry } from './workspace'

const round = (width: number, quantity = 1): BatchEntry => ({ shape: 'round', width, length: width, quantity })

describe('batch list', () => {
  it('adds the current footprint once', () => {
    expect(addToBatch([], defaultWorkspace().base)).toEqual([round(32)])
  })

  it('counts a footprint added again instead of listing it twice', () => {
    const base = defaultWorkspace().base
    expect(addToBatch(addToBatch([], base), base)).toEqual([round(32, 2)])
  })

  it('lists a different footprint separately', () => {
    expect(addToBatch([round(32)], presetFor(OVAL_SIZES[0]))).toEqual([round(32), { shape: 'oval', width: 60, length: 35, quantity: 1 }])
  })

  it('names each size the way a single export is named, with its quantity', () => {
    expect(batchFileName(presetFor(OVAL_SIZES[0]), 3)).toBe('base-oval-60x35mm-x3')
  })

  it('names the batch by its total number of bases', () => {
    expect(batchName([round(32, 10), round(40, 3)])).toBe('base-batch-13')
  })
})

describe('batch base settings', () => {
  it('exports the current footprint exactly as the single export would', () => {
    const workspace = defaultWorkspace()
    expect(batchBaseConfig(workspace, round(32, 10))).toBe(workspace.base)
  })

  it('changes only the footprint of the current base settings', () => {
    const workspace = synchronizeWorkspace({
      ...defaultWorkspace(),
      base: { ...defaultWorkspace().base, height: 5, profile: 'bevel', ribs: { count: 4, thickness: 2, height: 1.5 } },
    })
    expect(batchBaseConfig(workspace, { shape: 'oval', width: 75, length: 42, quantity: 1 })).toMatchObject({
      shape: 'oval',
      width: 75,
      length: 42,
      height: 5,
      profile: 'bevel',
      ribs: { thickness: 2, height: 1.5 },
    })
  })

  it('picks the automatic magnet count for the entry footprint', () => {
    const workspace = defaultWorkspace()
    const { magnets } = workspace.shared
    expect(batchBaseConfig(workspace, round(80)).magnets.count).toBe(
      automaticMagnetCount(80, 80, magnets.maxCount, magnets.diameter, magnets.thickness),
    )
  })

  it('applies a saved magnet count override for the entry footprint', () => {
    const workspace = defaultWorkspace()
    workspace.shared.magnetCounts[footprintKey('round', 60, 60)] = 6
    expect(batchBaseConfig(workspace, round(60)).magnets.count).toBe(6)
  })

  it('labels other sizes with their own size rather than the custom text', () => {
    const workspace = defaultWorkspace()
    workspace.base = { ...workspace.base, label: { ...workspace.base.label, text: '32' } }
    expect(batchBaseConfig(workspace, round(40)).label.text).toBeUndefined()
  })
})
