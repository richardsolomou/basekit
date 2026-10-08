import { readFileSync } from 'node:fs'
import type { Mesh } from 'manifold-3d'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import { buildToken, defaultTokenConfig, tokenFaceInset, tokenHeight, tokenName } from './token'
import type { EdgeProfile, TokenConfig, TokenImage, TokenShape } from './types'

let wasm: Awaited<ReturnType<typeof loadManifold>>
let font: Font

beforeAll(async () => {
  wasm = await loadManifold()
  const bytes = readFileSync('src/assets/fonts/oswald-700.woff')
  font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})

/** A white square image, with a dark disc in the middle unless it is blank, holed when `hole` is set. */
function discImage(size = 64, blank = false, hole = 0): TokenImage {
  const pixels = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - size / 2, y - size / 2)
      pixels[y * size + x] = !blank && r < size / 3 && r >= hole ? 0 : 255
    }
  }
  return { name: 'shield.png', width: size, height: size, luminance: Buffer.from(pixels).toString('base64') }
}

const build = (changes: Partial<TokenConfig> = {}) => buildToken(wasm, { ...defaultTokenConfig(), ...changes }, font)

function bounds(mesh: Mesh) {
  const { numProp, vertProperties: vertices } = mesh
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < vertices.length; i += numProp) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[i + axis])
      max[axis] = Math.max(max[axis], vertices[i + axis])
    }
  }
  return { min, max }
}

/** Vertices standing above the disc, which belong to the raised artwork. */
function raised(mesh: Mesh, thickness: number): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    if (mesh.vertProperties[i + 2] > thickness + 1e-3) points.push([mesh.vertProperties[i], mesh.vertProperties[i + 1]])
  }
  return points
}

/**
 * How far a point lies outside the flat top face, worked out from each shape's
 * own geometry rather than the builder's outline: negative inside.
 */
function beyondFace(config: TokenConfig, [x, y]: [number, number]): number {
  const inset = tokenFaceInset(config)
  const half = config.size / 2 - inset
  if (config.shape === 'round') return Math.hypot(x, y) - half
  if (config.shape === 'hex') return Math.max(Math.abs(y), Math.abs(x) * Math.cos(Math.PI / 6) + Math.abs(y) * Math.sin(Math.PI / 6)) - half
  const corner = Math.max(config.cornerRadius, inset) - inset
  const box = half - corner
  return Math.hypot(Math.max(0, Math.abs(x) - box), Math.max(0, Math.abs(y) - box)) - corner
}

const furthestBeyondFace = (config: TokenConfig) =>
  Math.max(...raised(buildToken(wasm, config, font).mesh, config.thickness).map((point) => beyondFace(config, point)))

function widthAbove(mesh: Mesh, z: number): number {
  const xs: number[] = []
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    if (mesh.vertProperties[i + 2] >= z - 1e-6) xs.push(mesh.vertProperties[i])
  }
  return Math.max(...xs) - Math.min(...xs)
}

function reachAbove(mesh: Mesh, z: number): number {
  let reach = 0
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
    if (mesh.vertProperties[i + 2] >= z - 1e-6) reach = Math.max(reach, Math.hypot(mesh.vertProperties[i], mesh.vertProperties[i + 1]))
  }
  return reach
}

describe('buildToken', () => {
  it('sits its full diameter on the build plate', () => {
    const config = defaultTokenConfig()
    const { min, max } = bounds(build().mesh)

    expect([min[2], max[0] - min[0]]).toEqual([expect.closeTo(0, 5), expect.closeTo(config.size, 2)])
  })

  it('raises the artwork above the disc by the relief height', () => {
    expect(bounds(build().mesh).max[2]).toBeCloseTo(tokenHeight(defaultTokenConfig()), 5)
  })

  it('adds volume for the text', () => {
    expect(build().stats.volume).toBeGreaterThan(build({ text: '' }).stats.volume)
  })

  it('adds volume for an image', () => {
    expect(build({ text: '', image: discImage() }).stats.volume).toBeGreaterThan(build({ text: '' }).stats.volume)
  })

  it('keeps an oversized number on the flat top face', () => {
    expect(furthestBeyondFace({ ...defaultTokenConfig(), text: '88', textHeight: 60 })).toBeLessThanOrEqual(1e-3)
  })

  it('keeps a long phrase on the flat top face', () => {
    expect(furthestBeyondFace({ ...defaultTokenConfig(), text: 'Oath of Moment' })).toBeLessThanOrEqual(1e-3)
  })

  it('wraps a long phrase onto several lines rather than shrinking it onto one', () => {
    const config = { ...defaultTokenConfig(), text: 'Oath of Moment' }
    const ys = raised(buildToken(wasm, config, font).mesh, config.thickness).map(([, y]) => y)

    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(12)
  })

  it('keeps a traced image on the flat top face', () => {
    expect(furthestBeyondFace({ ...defaultTokenConfig(), text: '', image: discImage() })).toBeLessThanOrEqual(1e-3)
  })

  it('puts the image above the text when the token has both', () => {
    const config = { ...defaultTokenConfig(), text: 'ABC', image: discImage() }
    const withImage = raised(buildToken(wasm, config, font).mesh, config.thickness)
    const textOnly = raised(buildToken(wasm, { ...config, image: null }, font).mesh, config.thickness)

    expect(Math.max(...withImage.map(([, y]) => y))).toBeGreaterThan(Math.max(...textOnly.map(([, y]) => y)) + 3)
  })

  it('fills where neighbouring glyphs overlap', () => {
    // Oswald's accents overhang their neighbours; an even-odd fill punches the overlap out.
    const relief = (text: string) => build({ size: 100, textHeight: 10, text }).stats.volume - build({ text: '', size: 100 }).stats.volume

    expect(relief('ÏÏ') / (2 * relief('Ï'))).toBeGreaterThan(0.97)
  })

  it('keeps the holes in a traced image', () => {
    const relief = (image: TokenImage) => build({ text: '', image }).stats.volume - build({ text: '' }).stats.volume

    expect(relief(discImage(64, false, 10)) / relief(discImage())).toBeLessThan(0.9)
  })

  it('refuses text too long to read rather than shrinking it to nothing', () => {
    expect(() => build({ size: 20, text: 'Supercalifragilisticexpialidocious' })).toThrow(/too long/)
  })

  it('refuses an image with nothing below the threshold', () => {
    expect(() => build({ text: '', image: discImage(64, true) })).toThrow(/nothing to raise/)
  })

  it('insets the top edge rather than the table face', () => {
    const config = defaultTokenConfig()

    expect(reachAbove(build({ text: '' }).mesh, config.thickness)).toBeCloseTo(config.size / 2 - config.profileSize, 2)
  })

  it('has no coincident vertices after positional welding', () => {
    const { mesh } = build({ text: 'Oath of Moment', image: discImage() })
    const positions = new Set<string>()
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      positions.add(`${mesh.vertProperties[i]},${mesh.vertProperties[i + 1]},${mesh.vertProperties[i + 2]}`)
    }
    expect(positions.size).toBe(mesh.vertProperties.length / mesh.numProp)
  })

  it('rejects an edge treatment that leaves no flat face', () => {
    expect(() => build({ size: 4, profileSize: 1 })).toThrow(/no flat face/)
  })
})

const SHAPES: TokenShape[] = ['round', 'square', 'hex']
const PROFILES: EdgeProfile[] = ['straight', 'taper', 'bevel', 'round']

/** Every artwork arrangement each shape has to hold on its face. */
const ARTWORK: [string, Partial<TokenConfig>][] = [
  ['an oversized number', { text: '88', textHeight: 60 }],
  ['a long phrase', { text: 'Oath of Moment' }],
  ['an image', { text: '', image: discImage() }],
  ['an image above text', { text: 'Oath of Moment', image: discImage() }],
]

describe.each(SHAPES)('a %s token', (shape) => {
  const config = (changes: Partial<TokenConfig> = {}): TokenConfig => ({ ...defaultTokenConfig(), shape, ...changes })

  it.each(PROFILES)('is a closed solid with no coincident vertices under a %s top edge', (profile) => {
    const { mesh } = buildToken(wasm, config({ profile, profileSize: 1, text: 'Oath of Moment', image: discImage() }), font)
    const positions = new Set<string>()
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
      positions.add(`${mesh.vertProperties[i]},${mesh.vertProperties[i + 1]},${mesh.vertProperties[i + 2]}`)
    }
    const solid = new wasm.Manifold(mesh)
    try {
      expect({ status: solid.status(), unique: positions.size === mesh.vertProperties.length / mesh.numProp }).toEqual({
        status: 'NoError',
        unique: true,
      })
    } finally {
      solid.delete()
    }
  })

  it.each(ARTWORK)('keeps %s inside the face outline', (_, changes) => {
    expect(furthestBeyondFace(config(changes))).toBeLessThanOrEqual(1e-3)
  })

  it('measures its size across the flats', () => {
    const { min, max } = bounds(buildToken(wasm, config(), font).mesh)

    expect(max[1] - min[1]).toBeCloseTo(defaultTokenConfig().size, 2)
  })

  it.each(PROFILES.filter((profile) => profile !== 'straight'))('pulls its top edge in under a %s', (profile) => {
    const tokenConfig = config({ text: '', profile, profileSize: 1 })
    const mesh = buildToken(wasm, tokenConfig, font).mesh
    const { min, max } = bounds(mesh)
    const top = widthAbove(mesh, tokenConfig.thickness)

    expect(max[0] - min[0] - top).toBeGreaterThanOrEqual(2 * tokenConfig.profileSize - 1e-3)
  })
})

describe('tokenName', () => {
  it('names the file after the shape, exact size and text', () => {
    expect(tokenName({ ...defaultTokenConfig(), shape: 'hex', size: 32.5, text: 'Oath of Moment' })).toBe('token-hex-32.5mm-oath-of-moment')
  })

  it('drops characters that do not survive a filename', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: ' A/B ' })).toBe('token-round-40mm-a-b')
  })

  it('falls back to the image name when there is no text', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: '', image: discImage() })).toBe('token-round-40mm-shield')
  })

  it('omits a blank label', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: ' ' })).toBe('token-round-40mm')
  })
})
