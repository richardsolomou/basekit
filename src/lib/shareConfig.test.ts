import { describe, expect, it } from 'vitest'
import { defaultHolderConfig } from '../geometry/holder'
import { DEFAULT_PRESET, presetFor, ROUND_SIZES } from '../geometry/presets'
import { decodeSharedProject, encodeSharedProject, sharedProjectFromUrl, shareUrl } from './shareConfig'

describe('shareable projects', () => {
  it('round-trips changes to both generators', () => {
    const base = { ...presetFor(ROUND_SIZES[1]), label: { enabled: true, height: 5, emboss: 0.6, text: 'Squad α' } }
    const holder = {
      ...defaultHolderConfig(),
      groups: [
        { id: 'unit', quantity: 5, diameter: 32 },
        { id: 'leader', quantity: 1, diameter: 40 },
      ],
    }
    const project = { model: 'holder' as const, base, holder }
    expect(decodeSharedProject(encodeSharedProject(project))).toEqual(project)
  })

  it('stores only values changed from the versioned defaults', () => {
    const project = { model: 'base' as const, base: presetFor(DEFAULT_PRESET), holder: defaultHolderConfig() }
    const encoded = encodeSharedProject(project)
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (character) => character.charCodeAt(0)),
    )
    expect(JSON.parse(json)).toEqual({ version: 1, model: 'base', base: {}, holder: {} })
  })

  it('rejects malformed and unknown payloads', () => {
    expect(decodeSharedProject('not-base64')).toBeUndefined()
    expect(decodeSharedProject(btoa(JSON.stringify({ version: 2, model: 'base', base: {}, holder: {} })))).toBeUndefined()
  })

  it('loads the project independently of its route', () => {
    const project = { model: 'base' as const, base: presetFor(ROUND_SIZES[2]), holder: defaultHolderConfig() }
    const url = shareUrl(project, 'https://example.com')
    expect(sharedProjectFromUrl(url)).toEqual(project)
    expect(sharedProjectFromUrl(url.replace('example.com/', 'example.com/holders'))).toEqual(project)
  })
})
