/**
 * Writes a sample STL per preset size so the geometry can be inspected outside the
 * browser. Usage: pnpm samples [outDir] [round|oval|painting|movement]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Font } from 'opentype.js'
import { buildBase } from '../src/geometry/base'
import { toStl } from '../src/geometry/exporters'
import { loadManifold } from '../src/geometry/manifold'
import { buildMovementTray, defaultMovementTrayConfig, movementTrayName } from '../src/geometry/movementTray'
import { baseName } from '../src/geometry/outline'
import {
  buildPaintingHandle,
  buildPaintingTray,
  defaultPaintingTrayConfig,
  paintingHandleConfig,
  paintingHandleName,
  paintingTrayName,
} from '../src/geometry/paintingTray'
import { OVAL_SIZES, presetFor, ROUND_SIZES } from '../src/geometry/presets'

const FONT_PATH = 'src/assets/fonts/oswald-700.woff'

// Node resolves opentype.js to its UMD build, which only exposes a CommonJS shape.
const { parse } = createRequire(import.meta.url)('opentype.js') as { parse: (b: ArrayBuffer) => Font }

const [outDir = 'samples', family = 'round'] = process.argv.slice(2)
const sizes = family === 'oval' ? OVAL_SIZES : ROUND_SIZES

const wasm = await loadManifold()
mkdirSync(outDir, { recursive: true })

if (family === 'painting') {
  const config = defaultPaintingTrayConfig()
  const parts = [
    { ...buildPaintingTray(wasm, { ...config, assembly: false }), name: paintingTrayName(config) },
    { ...buildPaintingHandle(wasm, paintingHandleConfig(config)), name: paintingHandleName(config) },
  ]
  for (const { mesh, stats, name } of parts) {
    const filename = `${name}.stl`
    writeFileSync(join(outDir, filename), toStl(mesh, filename))
    console.log(`${filename}  ${stats.triangles} tris  ${stats.volume.toFixed(0)}mm3  ${stats.grams.toFixed(2)}g`)
  }
  process.exit(0)
}

if (family === 'movement') {
  const square = defaultMovementTrayConfig()
  const configs = [square, { ...square, shape: 'round' as const, width: 25, length: 25 }]
  for (const config of configs) {
    const { mesh, stats } = buildMovementTray(wasm, config)
    const filename = `${movementTrayName(config)}.stl`
    writeFileSync(join(outDir, filename), toStl(mesh, filename))
    console.log(`${filename}  ${stats.triangles} tris  ${stats.volume.toFixed(0)}mm3  ${stats.grams.toFixed(2)}g`)
  }
  process.exit(0)
}

const bytes = readFileSync(FONT_PATH)
const font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))

for (const size of sizes) {
  const config = presetFor(size)
  const { mesh, stats } = buildBase(wasm, config, font)
  const name = `${baseName(config)}.stl`
  writeFileSync(join(outDir, name), toStl(mesh, name))
  console.log(`${name.padEnd(28)} ${stats.triangles} tris  ${stats.volume.toFixed(0)}mm3  ${stats.grams.toFixed(2)}g`)
}
