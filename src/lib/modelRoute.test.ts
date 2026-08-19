import { describe, expect, it } from 'vitest'
import { modelForPath } from './modelRoute'

describe('feature-gated routes', () => {
  it('keeps the box floors route inaccessible until its flag is enabled', () => {
    expect(modelForPath('/rack', false)).toBe('base')
    expect(modelForPath('/rack', true)).toBe('rack')
    expect(modelForPath('/holders', false)).toBe('holder')
  })
})
