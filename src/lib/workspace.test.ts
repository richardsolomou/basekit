import { describe, expect, it } from 'vitest'
import { defaultWorkspace, synchronizeWorkspace } from './workspace'

describe('workspace state', () => {
  it('starts both generators at their defaults', () => {
    expect(defaultWorkspace()).toMatchObject({ base: { width: 32 }, holder: { kind: 'holder', groups: [{ width: 32 }] } })
  })

  it('keeps every setting exposed by both generators synchronized', () => {
    const state = defaultWorkspace()
    state.shared.labelsEnabled = false
    state.shared.magnets = { diameter: 6, thickness: 1.5, clearance: 0.3 }
    const synchronized = synchronizeWorkspace(state)
    expect({ label: synchronized.base.label.enabled, engraving: synchronized.holder.engraving.enabled }).toEqual({
      label: false,
      engraving: false,
    })
    expect(synchronized.base.magnets).toMatchObject(synchronized.shared.magnets)
    expect(synchronized.holder.magnets).toMatchObject(synchronized.shared.magnets)
  })
})
