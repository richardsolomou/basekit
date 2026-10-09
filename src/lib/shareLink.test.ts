import { deflateSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { footprintKey } from '../geometry/presets'
import type { TokenImage } from '../geometry/types'
import { MAX_SHARE_URL_LENGTH, readShareHash, shareLink } from './shareLink'
import { applyWorkspaceSetup, defaultWorkspace, workspaceSetup, type GeneratorSettings, type WorkspaceState } from './workspace'

const PAGE = 'https://basekit.example/tokens'
const PARTS = Object.keys(defaultWorkspace()).filter((key) => key !== 'shared' && key !== 'batch') as GeneratorSettings[]

const hashOf = (url: string) => url.slice(url.indexOf('#'))
const opened = (from: WorkspaceState, part: GeneratorSettings, into = defaultWorkspace()) =>
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

  it.each(PARTS)('opens a %s link on its own generator', (part) => {
    expect(opened(defaultWorkspace(), part)?.part).toBe(part)
  })

  it('carries the shared magnets a movement tray uses', () => {
    const sender = defaultWorkspace()
    sender.shared.magnets.diameter = 6

    expect(opened(sender, 'movementTray')?.workspace.movementTray.magnets.diameter).toBe(6)
  })

  it('replaces only the count override for a movement tray footprint', () => {
    const recipient = defaultWorkspace()
    const { shape, width, length } = recipient.movementTray
    recipient.shared.magnetCounts = { [footprintKey(shape, width, length)]: 4, 'round:60x60': 6 }

    expect(opened(defaultWorkspace(), 'movementTray', recipient)?.workspace.shared.magnetCounts).toEqual({ 'round:60x60': 6 })
  })

  it('leaves the base batch out of a base link', () => {
    const sender = defaultWorkspace()
    sender.batch = [{ shape: 'round', width: 28.5, length: 28.5, quantity: 10 }]

    expect(opened(sender, 'base')?.workspace.batch).toEqual([])
  })

  it('keeps the recipient batch when opening a base link', () => {
    const recipient = defaultWorkspace()
    recipient.batch = [{ shape: 'oval', width: 60, length: 35, quantity: 3 }]

    expect(opened(defaultWorkspace(), 'base', recipient)?.workspace.batch).toEqual(recipient.batch)
  })

  it('upgrades a token link made at workspace version 8', () => {
    const legacy: Record<string, unknown> = { ...defaultWorkspace().token, diameter: 32.5 }
    for (const key of ['shape', 'size', 'cornerRadius']) delete legacy[key]
    const setup = readShareHash(hashFor({ v: 1, version: 8, part: 'token', config: legacy }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)?.workspace.token).toMatchObject({ shape: 'round', size: 32.5 })
  })

  it('keeps the recipient movement tray when opening a base link made at workspace version 8', () => {
    const recipient = defaultWorkspace()
    recipient.movementTray = { ...recipient.movementTray, columns: 7 }
    const setup = readShareHash(
      hashFor({ v: 1, version: 8, part: 'base', config: { ...defaultWorkspace().base, height: 5 }, shared: defaultWorkspace().shared }),
    )

    expect(applyWorkspaceSetup(recipient, setup)?.workspace).toMatchObject({ base: { height: 5 }, movementTray: { columns: 7 } })
  })

  it.each(PARTS)('opens a %s link made at workspace version 11', (part) => {
    const setup = readShareHash(hashFor({ v: 1, ...workspaceSetup(defaultWorkspace(), part), version: 11 }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)?.part).toBe(part)
  })

  it('ignores a link for the removed adapter generator', () => {
    const adapter = {
      kind: 'adapter',
      target: { shape: 'round', width: 32, length: 32 },
      source: { shape: 'round', width: 25, length: 25 },
    }
    const setup = readShareHash(hashFor({ v: 1, version: 11, part: 'adapter', config: adapter, shared: defaultWorkspace().shared }))

    expect(applyWorkspaceSetup(defaultWorkspace(), setup)).toBeUndefined()
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
