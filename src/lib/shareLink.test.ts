import { deflateSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { footprintKey } from '../geometry/presets'
import type { TokenImage } from '../geometry/types'
import { MAX_SHARE_URL_LENGTH, readShareHash, shareLink } from './shareLink'
import { applyWorkspaceSetup, defaultWorkspace, type WorkspacePart, type WorkspaceState } from './workspace'

const PAGE = 'https://basekit.example/tokens'

const hashOf = (url: string) => url.slice(url.indexOf('#'))
const opened = (from: WorkspaceState, part: WorkspacePart, into = defaultWorkspace()) =>
  applyWorkspaceSetup(into, readShareHash(hashOf(shareLink(PAGE, from, part).url)))
const hashFor = (payload: unknown) =>
  `#setup=${btoa(String.fromCharCode(...deflateSync(strToU8(JSON.stringify(payload)))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')}`

function image(pixel: (index: number) => number, side = 256): TokenImage {
  let binary = ''
  for (let i = 0; i < side * side; i += 1) binary += String.fromCharCode(pixel(i))
  return { name: 'art.png', width: side, height: side, luminance: btoa(binary) }
}

describe('share links', () => {
  it('opens the shared generator with its settings', () => {
    const sender = defaultWorkspace()
    sender.base = { ...sender.base, width: 50, length: 50, height: 5 }

    expect(opened(sender, 'base')).toMatchObject({ part: 'base', workspace: { base: { width: 50, height: 5 } } })
  })

  it('carries the shared settings a generator depends on', () => {
    const sender = defaultWorkspace()
    sender.shared.magnets.diameter = 6

    expect(opened(sender, 'holder')?.workspace.holder.magnets.diameter).toBe(6)
  })

  it('leaves shared settings alone for a generator that does not use them', () => {
    const sender = defaultWorkspace()
    sender.shared.magnets.diameter = 6
    sender.stem.bodyHeight = 20

    expect(opened(sender, 'stem')?.workspace.shared.magnets.diameter).toBe(5)
  })

  it('keeps the other generators as the recipient saved them', () => {
    const recipient = defaultWorkspace()
    recipient.token.text = 'Objective'

    expect(opened(defaultWorkspace(), 'base', recipient)?.workspace.token.text).toBe('Objective')
  })

  it('replaces only the count overrides for the shared footprint', () => {
    const recipient = defaultWorkspace()
    const shared = footprintKey(recipient.base.shape, recipient.base.width, recipient.base.length)
    recipient.shared.magnetCounts = { [shared]: 4, 'round:60x60': 6 }

    expect(opened(defaultWorkspace(), 'base', recipient)?.workspace.shared.magnetCounts).toEqual({ 'round:60x60': 6 })
  })

  it('keeps a small token image', () => {
    const sender = defaultWorkspace()
    sender.token.image = image((i) => (i % 256 < 128 ? 0 : 255))

    expect(opened(sender, 'token')?.workspace.token.image).toEqual(sender.token.image)
  })

  it('leaves out a token image that would make the link too long', () => {
    const sender = defaultWorkspace()
    sender.token.image = image((i) => (i * 2654435761) >>> 24)

    expect(shareLink(PAGE, sender, 'token')).toMatchObject({ imageOmitted: true })
  })

  it('keeps a link without its image under the length cap', () => {
    const sender = defaultWorkspace()
    sender.token.image = image((i) => (i * 2654435761) >>> 24)

    expect(shareLink(PAGE, sender, 'token').url.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH)
  })

  it('migrates a link made by an older workspace version', () => {
    const legacy = JSON.parse(JSON.stringify(defaultWorkspace().holder))
    legacy.spacing = 3
    delete legacy.edgeSpacing
    const setup = readShareHash(hashFor({ v: 1, version: 3, part: 'holder', config: legacy, shared: defaultWorkspace().shared }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)?.workspace.holder.edgeSpacing).toBe(1.5)
  })

  it('ignores a hash that is not a share link', () => {
    expect(readShareHash('#top')).toBeUndefined()
  })

  it('ignores a garbled share link', () => {
    expect(readShareHash('#setup=not-a-real-link')).toBeUndefined()
  })

  it('ignores a share link from another link version', () => {
    expect(readShareHash(hashFor({ v: 2, version: 8, part: 'stem', config: defaultWorkspace().stem }))).toBeUndefined()
  })

  it('ignores a link from a newer workspace version', () => {
    const setup = readShareHash(hashFor({ v: 1, version: 99, part: 'stem', config: defaultWorkspace().stem }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)).toBeUndefined()
  })

  it('ignores a link whose settings fail validation', () => {
    const setup = readShareHash(hashFor({ v: 1, version: 8, part: 'base', config: { ...defaultWorkspace().base, width: 'wide' } }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)).toBeUndefined()
  })

  it('ignores a link for an unknown generator', () => {
    const setup = readShareHash(hashFor({ v: 1, version: 8, part: 'shield', config: defaultWorkspace().stem }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)).toBeUndefined()
  })
})
