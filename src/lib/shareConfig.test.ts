import { describe, expect, it } from 'vitest'
import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor, ROUND_SIZES } from '../geometry/presets'
import { sharedProjectFromUrl, shareUrl } from './shareConfig'

describe('shareable projects', () => {
  it('round-trips visible changes to both generators', () => {
    const base = { ...presetFor(ROUND_SIZES[1]), label: { enabled: true, height: 5, emboss: 0.6, text: 'Squad α' } }
    const holder = {
      ...defaultHolderConfig(),
      groups: [
        { id: 'models-1', quantity: 5, diameter: 32 },
        { id: 'models-2', quantity: 1, diameter: 40 },
      ],
    }
    const project = { model: 'holder' as const, base, holder }
    const url = shareUrl(project, 'https://example.com')
    expect(url).toContain('/holders?')
    expect(url).toContain('base.width=28.5')
    expect(url).toContain('base.label.text=Squad+%CE%B1')
    expect(url).toContain('holder.group=5x32&holder.group=1x40')
    expect(sharedProjectFromUrl(url)).toEqual(project)
  })

  it('stores one shared magnet specification', () => {
    const base = presetFor(DEFAULT_PRESET)
    base.magnets = { ...base.magnets, diameter: 6, thickness: 3, clearance: 0.1 }
    const holder = defaultHolderConfig()
    holder.magnets = { ...holder.magnets, diameter: 6, thickness: 3, clearance: 0.1 }
    const url = shareUrl({ model: 'base', base, holder }, 'https://example.com')
    expect(url).toContain('magnet.diameter=6')
    expect(url).not.toContain('base.magnets.diameter')
    expect(url).not.toContain('holder.magnets.diameter')
    expect(sharedProjectFromUrl(url)).toEqual({ model: 'base', base, holder })
  })

  it('keeps an unchanged project URL clean', () => {
    const project = { model: 'base' as const, base: presetFor(DEFAULT_PRESET), holder: defaultHolderConfig() }
    expect(shareUrl(project, 'https://example.com')).toBe('https://example.com/')
  })

  it('rejects malformed and unknown versions', () => {
    expect(sharedProjectFromUrl('https://example.com/?base.width=40')).toBeUndefined()
    expect(sharedProjectFromUrl('https://example.com/?base.width=40&v=2')).toBeUndefined()
  })

  it('takes the active generator from the route', () => {
    const project = { model: 'base' as const, base: presetFor(ROUND_SIZES[1]), holder: defaultHolderConfig() }
    const url = shareUrl(project, 'https://example.com')
    expect(sharedProjectFromUrl(url)?.model).toBe('base')
    expect(sharedProjectFromUrl(url.replace('example.com/', 'example.com/holders'))?.model).toBe('holder')
  })
})
