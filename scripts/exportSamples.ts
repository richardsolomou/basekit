/**
 * Writes a sample STL per preset size so the geometry can be inspected outside the
 * browser. Usage: pnpm samples [outDir] [round|oval|tier]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Font } from 'opentype.js'
import { buildBase } from '../src/geometry/base'
import { toStl } from '../src/geometry/exporters'
import { buildHolder, defaultHolderConfig, holderGroup, holderName } from '../src/geometry/holder'
import { loadManifold } from '../src/geometry/manifold'
import { baseName } from '../src/geometry/outline'
import { OVAL_SIZES, presetFor, ROUND_SIZES } from '../src/geometry/presets'

const FONT_PATH = 'src/assets/fonts/oswald-700.woff'

// Node resolves opentype.js to its UMD build, which only exposes a CommonJS shape.
const { parse } = createRequire(import.meta.url)('opentype.js') as { parse: (b: ArrayBuffer) => Font }

const [outDir = 'samples', family = 'round'] = process.argv.slice(2)
const sizes = family === 'oval' ? OVAL_SIZES : family === 'tier' ? [] : ROUND_SIZES

const wasm = await loadManifold()
const bytes = readFileSync(FONT_PATH)
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

mkdirSync(outDir, { recursive: true })
if (family === 'tier') {
  const defaults = defaultHolderConfig()
  const config = {
    ...defaults,
    groups: [holderGroup('sample', 1, { width: 50 })],
    tier: { ...defaults.tier, enabled: true },
  }
  const { mesh, stats } = buildHolder(wasm, config, font)
  const name = `${holderName(config)}.stl`
  writeFileSync(join(outDir, name), toStl(mesh, name))
  console.log(`${name.padEnd(28)} ${stats.triangles} tris  ${stats.volume.toFixed(0)}mm3  ${stats.grams.toFixed(2)}g`)
}
for (const size of sizes) {
  const config = presetFor(size)
  const { mesh, stats } = buildBase(wasm, config, font)
  const name = `${baseName(config)}.stl`
  writeFileSync(join(outDir, name), toStl(mesh, name))
  console.log(`${name.padEnd(28)} ${stats.triangles} tris  ${stats.volume.toFixed(0)}mm3  ${stats.grams.toFixed(2)}g`)
}
