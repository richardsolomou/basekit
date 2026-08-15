/**
 * Writes a sample STL per preset size so the geometry can be inspected outside the
 * browser. Usage: pnpm samples [outDir] [round|oval|rack]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Font } from 'opentype.js'
import { buildBase } from '../src/geometry/base'
import { toStl } from '../src/geometry/exporters'
import { loadManifold } from '../src/geometry/manifold'
import { baseName } from '../src/geometry/outline'
import { OVAL_SIZES, presetFor, ROUND_SIZES } from '../src/geometry/presets'
import { buildRack, defaultRackConfig, rackName } from '../src/geometry/rack'

const FONT_PATH = 'src/assets/fonts/oswald-700.woff'

// Node resolves opentype.js to its UMD build, which only exposes a CommonJS shape.
const { parse } = createRequire(import.meta.url)('opentype.js') as { parse: (b: ArrayBuffer) => Font }

const [outDir = 'samples', family = 'round'] = process.argv.slice(2)
const sizes = family === 'oval' ? OVAL_SIZES : family === 'rack' ? [] : ROUND_SIZES

const wasm = await loadManifold()
const bytes = readFileSync(FONT_PATH)
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

mkdirSync(outDir, { recursive: true })
if (family === 'rack') {
  const config = defaultRackConfig()
  const { mesh, stats } = buildRack(wasm, config)
  const name = `${rackName(config)}.stl`
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
