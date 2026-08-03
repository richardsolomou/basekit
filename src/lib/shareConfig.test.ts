import { describe, expect, it } from 'vitest'
import { defaultHolderConfig } from '../geometry/holder'
import { presetFor, ROUND_SIZES } from '../geometry/presets'
import { decodeSharedConfig, encodeSharedConfig, sharedConfigFromUrl, shareUrl } from './shareConfig'

describe('shareable configurations', () => {
  it('round-trips an exact base configuration', () => {
    const config = { ...presetFor(ROUND_SIZES[1]), label: { enabled: true, height: 5, emboss: 0.6, text: 'Squad α' } }
    expect(decodeSharedConfig(encodeSharedConfig(config))).toEqual({ model: 'base', config })
  })

  it('round-trips every holder group', () => {
    const config = {
      ...defaultHolderConfig(),
      groups: [
        { id: 'unit', quantity: 5, diameter: 32 },
        { id: 'leader', quantity: 1, diameter: 40 },
      ],
    }
    expect(decodeSharedConfig(encodeSharedConfig(config))).toEqual({ model: 'holder', config })
  })

  it('rejects malformed and unknown payloads', () => {
    expect(decodeSharedConfig('not-base64')).toBeUndefined()
    expect(decodeSharedConfig(btoa(JSON.stringify({ version: 2, model: 'base', config: {} })))).toBeUndefined()
  })

  it('only loads configurations on their matching route', () => {
    const config = presetFor(ROUND_SIZES[2])
    const url = shareUrl(config, 'https://example.com')
    expect(sharedConfigFromUrl(url)).toEqual({ model: 'base', config })
    expect(sharedConfigFromUrl(url.replace('example.com/', 'example.com/holders'))).toBeUndefined()
  })
})
