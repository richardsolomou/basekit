import { readFileSync } from 'node:fs'
import { parse, type Font } from 'opentype.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildBase } from './base'
import { buildHolder, defaultHolderConfig, holderGroup, holderPlan } from './holder'
import { loadManifold } from './manifold'
import { buildPaintingHandle, buildPaintingTray, defaultPaintingTrayConfig, paintingHandleConfig } from './paintingTray'
import { DEFAULT_PRESET, presetFor } from './presets'
import { exportSegmentsFor } from './quality'
import { buildFlightStem, defaultFlightStemConfig } from './stem'
import { buildToken, defaultTokenConfig } from './token'
import type { BaseStats } from './types'

let wasm: Awaited<ReturnType<typeof loadManifold>>
let font: Font

beforeAll(async () => {
  wasm = await loadManifold()
  const bytes = readFileSync('src/assets/fonts/oswald-700.woff')
  font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
})

const PLA_GRAMS_PER_MM3 = 1.24e-3

describe('build stats', () => {
  const generators: [string, () => BaseStats][] = [
    ['base', () => buildBase(wasm, presetFor(DEFAULT_PRESET), font).stats],
    ['holder', () => buildHolder(wasm, defaultHolderConfig(), font).stats],
    ['spray tray', () => buildPaintingTray(wasm, defaultPaintingTrayConfig()).stats],
    ['flight stem', () => buildFlightStem(wasm, defaultFlightStemConfig()).stats],
    ['token', () => buildToken(wasm, defaultTokenConfig(), font).stats],
  ]

  it.each(generators)('weighs the %s preview as solid PLA', (_, stats) => {
    const { volume, grams } = stats()
    expect(volume).toBeGreaterThan(0)
    expect(grams).toBeCloseTo(volume * PLA_GRAMS_PER_MM3, 6)
  })

  it('weighs the assembled spray tray preview as the tray plus its handle', () => {
    const config = defaultPaintingTrayConfig()
    const tray = buildPaintingTray(wasm, { ...config, assembly: false }).stats.grams
    const handle = buildPaintingHandle(wasm, paintingHandleConfig(config)).stats.grams
    expect(buildPaintingTray(wasm, config).stats.grams / (tray + handle)).toBeCloseTo(1, 2)
  })

  it('weighs a split holder preview as the sum of its modules', () => {
    const config = {
      ...defaultHolderConfig(),
      maxColumns: 2,
      maxRows: 4,
      groups: [holderGroup('unit', 5, { width: 32 }), holderGroup('character', 1, { width: 32 })],
    }
    const modules = holderPlan(config).modules.map((module) => buildHolder(wasm, module.config, font).stats.grams)
    expect(modules.length).toBeGreaterThan(1)
    expect(buildHolder(wasm, config, font).stats.grams / modules.reduce((sum, grams) => sum + grams, 0)).toBeCloseTo(1, 4)
  })

  it('weighs a preview base within a tenth of a percent of its export', () => {
    const config = presetFor(DEFAULT_PRESET)
    const preview = buildBase(wasm, config, font).stats.grams
    const exported = buildBase(wasm, { ...config, segments: exportSegmentsFor(config.width) }, font).stats.grams
    expect(Math.abs(preview / exported - 1)).toBeLessThan(0.001)
  })
})
