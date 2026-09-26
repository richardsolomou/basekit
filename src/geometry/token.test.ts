import { readFileSync } from 'node:fs'
import type { Mesh } from 'manifold-3d'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadManifold } from './manifold'
import { buildToken, defaultTokenConfig, tokenFaceRadius, tokenHeight, tokenName } from './token'
import type { TokenConfig, TokenImage } from './types'

let wasm: Awaited<ReturnType<typeof loadManifold>>
let font: Font

beforeAll(async () => {
  wasm = await loadManifold()
  const bytes = readFileSync('src/assets/fonts/oswald-700.woff')
  font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})

/** A white square image, with a dark disc in the middle unless it is blank. */
function discImage(size = 64, blank = false): TokenImage {
  const pixels = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) pixels[y * size + x] = !blank && Math.hypot(x - size / 2, y - size / 2) < size / 3 ? 0 : 255
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

    expect([min[2], max[0] - min[0]]).toEqual([expect.closeTo(0, 5), expect.closeTo(config.diameter, 2)])
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
    const config = { ...defaultTokenConfig(), text: '88', textHeight: 60 }

    expect(reachAbove(buildToken(wasm, config, font).mesh, config.thickness + 1e-3)).toBeLessThanOrEqual(tokenFaceRadius(config) + 1e-3)
  })

  it('keeps a long phrase on the flat top face', () => {
    const config = { ...defaultTokenConfig(), text: 'Oath of Moment' }

    expect(reachAbove(buildToken(wasm, config, font).mesh, config.thickness + 1e-3)).toBeLessThanOrEqual(tokenFaceRadius(config) + 1e-3)
  })

  it('wraps a long phrase onto several lines rather than shrinking it onto one', () => {
    const config = { ...defaultTokenConfig(), text: 'Oath of Moment' }
    const ys = raised(buildToken(wasm, config, font).mesh, config.thickness).map(([, y]) => y)

    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(12)
  })

  it('keeps a traced image on the flat top face', () => {
    const config = { ...defaultTokenConfig(), text: '', image: discImage() }

    expect(reachAbove(buildToken(wasm, config, font).mesh, config.thickness + 1e-3)).toBeLessThanOrEqual(tokenFaceRadius(config) + 1e-3)
  })

  it('puts the image above the text when the token has both', () => {
    const config = { ...defaultTokenConfig(), text: 'ABC', image: discImage() }
    const withImage = raised(buildToken(wasm, config, font).mesh, config.thickness)
    const textOnly = raised(buildToken(wasm, { ...config, image: null }, font).mesh, config.thickness)

    expect(Math.max(...withImage.map(([, y]) => y))).toBeGreaterThan(Math.max(...textOnly.map(([, y]) => y)) + 3)
  })

  it('refuses text too long to read rather than shrinking it to nothing', () => {
    expect(() => build({ diameter: 20, text: 'Supercalifragilisticexpialidocious' })).toThrow(/too long/)
  })

  it('refuses an image with nothing below the threshold', () => {
    expect(() => build({ text: '', image: discImage(64, true) })).toThrow(/nothing to raise/)
  })

  it('insets the top edge rather than the table face', () => {
    const config = defaultTokenConfig()

    expect(reachAbove(build({ text: '' }).mesh, config.thickness)).toBeCloseTo(config.diameter / 2 - config.profileSize, 2)
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
    expect(() => build({ diameter: 4, profileSize: 1 })).toThrow(/no flat face/)
  })
})

describe('tokenName', () => {
  it('names the file after the diameter and text', () => {
    expect(tokenName({ ...defaultTokenConfig(), diameter: 32.5, text: 'Oath of Moment' })).toBe('token-32.5mm-oath-of-moment')
  })

  it('drops characters that do not survive a filename', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: ' A/B ' })).toBe('token-40mm-a-b')
  })

  it('falls back to the image name when there is no text', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: '', image: discImage() })).toBe('token-40mm-shield')
  })

  it('omits a blank label', () => {
    expect(tokenName({ ...defaultTokenConfig(), text: ' ' })).toBe('token-40mm')
  })
})
