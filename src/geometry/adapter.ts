import type { CrossSection, Manifold, ManifoldToplevel, Vec3 } from 'manifold-3d'
import { magnetPositions, type BuildResult } from './base'
import { holderGroupLabel } from './holder'
import { baseOutline, footprint, isElongated, trimNumber } from './outline'
import { profileSteps } from './profile'
import { curveTolerance, previewSegmentsFor } from './quality'
import type { AdapterConfig, AdapterFootprint } from './types'

const PLA_DENSITY = 1.24e-3
/** Material kept between the recess floor and the underside, or the tops of its magnet pockets. */
export const ADAPTER_MIN_FLOOR = 0.8

export function defaultAdapterConfig(): AdapterConfig {
  return {
    kind: 'adapter',
    target: { shape: 'round', width: 32, length: 32 },
    source: { shape: 'round', width: 25, length: 25 },
    clearance: 0.5,
    recessDepth: 2,
    height: 4,
    profile: 'taper',
    profileSize: 1,
    minWall: 1,
    magnets: {
      enabled: false,
      count: 1,
      layout: 'balanced',
      patternVersion: 2,
      maxCount: 8,
      diameter: 5,
      clearance: 0.2,
      depthClearance: 0.1,
      bossWall: 0.9,
      thickness: 2,
    },
    segments: previewSegmentsFor(32),
  }
}

const sizeName = (part: AdapterFootprint) => {
  const { width, length } = footprint(part)
  return `${part.shape}-${isElongated(part.shape) ? `${trimNumber(width)}x${trimNumber(length)}` : trimNumber(width)}mm`
}

export function adapterName(config: AdapterConfig): string {
  return `adapter-${sizeName(config.source)}-to-${sizeName(config.target)}`
}

export const adapterPocketDepth = (config: Pick<AdapterConfig, 'magnets'>): number =>
  config.magnets.enabled && config.magnets.count > 0 ? config.magnets.thickness + config.magnets.depthClearance : 0

export const minAdapterHeight = (config: Pick<AdapterConfig, 'magnets' | 'recessDepth'>): number =>
  config.recessDepth + ADAPTER_MIN_FLOOR + adapterPocketDepth(config)

export const maxAdapterRecessDepth = (config: Pick<AdapterConfig, 'magnets' | 'height'>): number =>
  config.height - ADAPTER_MIN_FLOOR - adapterPocketDepth(config)

/** The cut that takes the old base: its footprint plus clearance, turned to share the long axis of an elongated target. */
export function adapterRecess(config: Pick<AdapterConfig, 'source' | 'target' | 'clearance'>): AdapterFootprint {
  const { width, length } = footprint(config.source)
  const target = footprint(config.target)
  const turned = isElongated(config.target.shape) && (width - length) * (target.width - target.length) < 0
  return {
    shape: config.source.shape,
    width: (turned ? length : width) + config.clearance,
    length: (turned ? width : length) + config.clearance,
  }
}

const outlineOf = (wasm: ManifoldToplevel, part: AdapterFootprint, cornerRadius: number, segments: number) =>
  baseOutline(wasm, { ...part, cornerRadius, sides: 6, segments })

export function buildAdapter(wasm: ManifoldToplevel, config: AdapterConfig): BuildResult {
  const { CrossSection, Manifold } = wasm
  const trash: { delete: () => void }[] = []
  const own = <T extends { delete: () => void }>(value: T): T => {
    trash.push(value)
    return value
  }
  const section = (value: CrossSection) => own(value)
  const solidOf = (value: Manifold) => own(value)

  try {
    if (config.recessDepth <= 0) throw new Error('Recess needs a positive depth')
    if (config.height < minAdapterHeight(config) - 1e-6) {
      throw new Error(
        adapterPocketDepth(config) > 0
          ? 'Recess and magnet pockets leave too little floor between them — make the adapter taller'
          : 'Recess leaves too little floor beneath it — make the adapter taller',
      )
    }

    const target = footprint(config.target)
    const segments = config.segments
    const outline = section(outlineOf(wasm, config.target, Math.min(2, Math.min(target.width, target.length) * 0.06), segments))

    // Square corners take any rounded old base; matching a guessed radius could leave one that does not drop in.
    const recess = section(outlineOf(wasm, adapterRecess(config), 0, segments))

    const fits = (inset: number) => section(recess.subtract(section(outline.offset(-inset, 'Miter', 2, segments)))).isEmpty()
    if (!fits(config.minWall)) {
      throw new Error(
        `${holderGroupLabel(config.source)} does not fit inside ${holderGroupLabel(config.target)} with a ${trimNumber(config.minWall)}mm wall`,
      )
    }

    // The base profile, flipped: the adapter prints upright, so its tapered edge is the top face, which is also where the recess opens.
    const tolerance = curveTolerance(Math.max(target.width, target.length), segments)
    const steps = profileSteps(config.height, config.profile, config.profileSize, tolerance)
    if (!fits(config.minWall + steps[0].inset)) {
      throw new Error('Edge profile leaves too little wall beside the recess — reduce the edge size')
    }

    const points: Vec3[] = []
    for (const step of steps) {
      const ring = step.inset > 0 ? section(outline.offset(-step.inset, 'Miter', 2, segments)) : outline
      for (const contour of ring.toPolygons()) {
        for (const [x, y] of contour) points.push([x, y, config.height - step.z])
      }
    }
    let solid = solidOf(Manifold.hull(points))

    // Cut past the top face so no zero-thickness skin is left behind.
    const plug = solidOf(recess.extrude(config.recessDepth + 1))
    solid = solidOf(solid.subtract(solidOf(plug.translate([0, 0, config.height - config.recessDepth]))))

    const pocketDepth = adapterPocketDepth(config)
    if (pocketDepth > 0) {
      const room = section(outline.offset(-config.minWall, 'Miter', 2, segments)).bounds()
      const pocketRadius = (config.magnets.diameter + config.magnets.clearance) / 2
      const magnets = magnetPositions(
        config.magnets.count,
        (room.max[0] - room.min[0]) / 2,
        (room.max[1] - room.min[1]) / 2,
        pocketRadius + config.magnets.bossWall,
        { ellipticalRow: config.target.shape === 'oval', layout: config.magnets.layout },
      )
      // Pockets open on the underside, the face that meets the tray and sits on the build plate.
      const drill = solidOf(section(CrossSection.circle(pocketRadius, segments)).extrude(pocketDepth + 1))
      for (const m of magnets) solid = solidOf(solid.subtract(solidOf(drill.translate([m.x, m.y, -1]))))
    }

    const volume = solid.volume()
    const triangles = solid.numTri()
    return {
      mesh: solid.getMesh(),
      stats: { triangles, volume, grams: volume * PLA_DENSITY, solid: volume > 0 && triangles > 0 },
    }
  } finally {
    for (const value of trash) value.delete()
  }
}
