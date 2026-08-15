import type { CrossSection, Manifold, ManifoldToplevel, Mesh, Vec3 } from 'manifold-3d'
import type { BaseStats, TierConfig } from './types'

export const GRID = 42
const GAP = 0.5
const CORNER_RADIUS = 3.75
const PROFILE = [
  { inset: 2.95, z: 0 },
  { inset: 2.15, z: 0.8 },
  { inset: 2.15, z: 2.6 },
  { inset: 0, z: 4.75 },
] as const
const PLA_DENSITY = 1.24e-3
const SOCKET_DEPTH = 2.8
const SOCKET_CLEARANCE = 0.35

export interface TierBuildResult {
  mesh: Mesh
  stats: BaseStats
}

export function defaultTierConfig(): TierConfig {
  return { kind: 'tier', columns: 3, rows: 2, clearance: 84, deckThickness: 5, pillarSize: 12, segments: 96 }
}

export function tierSize(config: TierConfig) {
  return {
    width: config.columns * GRID - GAP,
    length: config.rows * GRID - GAP,
    height: config.clearance + config.deckThickness,
  }
}

export function tierName(config: TierConfig) {
  return `tier-${config.columns}x${config.rows}-${config.clearance}mm-clearance`
}

export function buildTier(wasm: ManifoldToplevel, config: TierConfig): TierBuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => (trash.push(value), value)
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)
  try {
    if (config.columns < 1 || config.rows < 1) throw new Error('A tier needs at least one row and column')
    if (config.clearance < 14) throw new Error('Tier clearance must be at least 14mm')
    if (config.deckThickness < SOCKET_DEPTH + 0.8) throw new Error('The deck is too thin for its locating sockets')
    if (config.pillarSize < 8 || config.pillarSize > 24) throw new Error('Pillar size must be between 8mm and 24mm')
    const { width, length } = tierSize(config)
    const roundedRect = (outerWidth: number, outerLength: number, inset: number) => {
      const w = outerWidth - inset * 2
      const l = outerLength - inset * 2
      const radius = Math.max(0.01, CORNER_RADIUS - inset)
      return section(CrossSection.square([w - radius * 2, l - radius * 2], true).offset(radius, 'Round', 2, 32))
    }
    const pointsAt = (outline: CrossSection, z: number): Vec3[] =>
      outline.toPolygons().flatMap((ring) => ring.map(([x, y]): Vec3 => [x, y, z]))

    const footSegments: Manifold[] = []
    for (let i = 0; i < PROFILE.length - 1; i++) {
      const from = roundedRect(GRID - GAP, GRID - GAP, PROFILE[i].inset)
      const to = roundedRect(GRID - GAP, GRID - GAP, PROFILE[i + 1].inset)
      footSegments.push(solidOf(Manifold.hull([...pointsAt(from, PROFILE[i].z), ...pointsAt(to, PROFILE[i + 1].z)])))
    }
    const foot = solidOf(Manifold.union(footSegments))
    const cornerCells = [
      [0, 0],
      [config.columns - 1, 0],
      [0, config.rows - 1],
      [config.columns - 1, config.rows - 1],
    ].filter(([x, y], index, cells) => cells.findIndex(([cx, cy]) => cx === x && cy === y) === index)
    const supports: Manifold[] = []
    for (const [cellX, cellY] of cornerCells) {
      const x = (cellX - (config.columns - 1) / 2) * GRID
      const y = (cellY - (config.rows - 1) / 2) * GRID
      supports.push(solidOf(foot.translate([x, y, 0])))
      const pillar = solidOf(
        CrossSection.square([config.pillarSize - 3, config.pillarSize - 3], true)
          .offset(1.5, 'Round', 2, 16)
          .extrude(config.clearance - 3.6),
      )
      supports.push(solidOf(pillar.translate([x, y, 4])))
    }
    const deckOutline = roundedRect(width, length, 0)
    const deck = solidOf(deckOutline.extrude(config.deckThickness).translate([0, 0, config.clearance]))
    let solid = solidOf(Manifold.union([...supports, deck]))

    const sockets: Manifold[] = []
    for (let y = 0; y < config.rows; y++) {
      for (let x = 0; x < config.columns; x++) {
        const cx = (x - (config.columns - 1) / 2) * GRID
        const cy = (y - (config.rows - 1) / 2) * GRID
        const socket = roundedRect(GRID - GAP + SOCKET_CLEARANCE * 2, GRID - GAP + SOCKET_CLEARANCE * 2, 2.15)
        sockets.push(
          solidOf(socket.extrude(SOCKET_DEPTH + 0.01).translate([cx, cy, config.clearance + config.deckThickness - SOCKET_DEPTH])),
        )
      }
    }
    solid = solidOf(Manifold.difference([solid, ...sockets]))
    const volume = solid.volume()
    const triangles = solid.numTri()
    return { mesh: solid.getMesh(), stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 } }
  } finally {
    for (const value of trash) value.delete()
  }
}
