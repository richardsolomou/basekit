import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { BuildResult } from './base'
import { trimNumber } from './outline'
import { previewSegmentsFor } from './quality'
import type { FlightStemConfig } from './types'

const PLA_DENSITY = 1.24e-3
const JOIN_OVERLAP = 0.05

export const CLASSIC_STEM_HEIGHTS = [15, 20, 30, 35] as const

export function defaultFlightStemConfig(): FlightStemConfig {
  return {
    kind: 'stem',
    bodyHeight: 15,
    bodyDiameter: 4.8,
    connection: 'peg',
    modelPegDiameter: 1.8,
    modelPegLength: 4,
    ballDiameter: 4,
    segments: previewSegmentsFor(4.8),
  }
}

export function stemOverallHeight(config: FlightStemConfig): number {
  return config.bodyHeight + (config.connection === 'peg' ? config.modelPegLength : config.ballDiameter - JOIN_OVERLAP)
}

export function stemName(config: FlightStemConfig): string {
  const connection = config.connection === 'ball' ? '-ball' : ''
  return `flying-stem-${trimNumber(config.bodyHeight)}mm${connection}`
}

export const stemNeckDiameter = (config: FlightStemConfig): number =>
  config.connection === 'peg' ? config.modelPegDiameter : config.ballDiameter / 2

export const stemMaximumDiameter = (config: FlightStemConfig): number =>
  Math.max(config.bodyDiameter, config.connection === 'ball' ? config.ballDiameter : 0)

export function buildFlightStem(wasm: ManifoldToplevel, config: FlightStemConfig): BuildResult {
  const { Manifold } = wasm
  const trash: Manifold[] = []
  const own = (value: Manifold) => {
    trash.push(value)
    return value
  }

  try {
    if (config.bodyHeight < 2) throw new Error('Flying-stem body must be at least 2 mm tall')
    const neckDiameter = stemNeckDiameter(config)
    if (config.bodyDiameter < neckDiameter) {
      throw new Error('Flying-stem body must be at least as wide as its miniature connection')
    }
    if (config.connection === 'peg' && config.modelPegLength <= 0) {
      throw new Error('Flying-stem mounting peg needs a positive length')
    }
    if (config.connection === 'ball' && config.ballDiameter <= 0) {
      throw new Error('Flying-stem ball joint needs a positive diameter')
    }

    const bodyRadius = config.bodyDiameter / 2
    const neckRadius = neckDiameter / 2
    const body = own(Manifold.cylinder(config.bodyHeight, bodyRadius, neckRadius, config.segments))
    const connection =
      config.connection === 'peg'
        ? own(
            own(Manifold.cylinder(config.modelPegLength + JOIN_OVERLAP, neckRadius, neckRadius, config.segments)).translate([
              0,
              0,
              config.bodyHeight - JOIN_OVERLAP,
            ]),
          )
        : own(
            own(Manifold.sphere(config.ballDiameter / 2, config.segments)).translate([
              0,
              0,
              config.bodyHeight + config.ballDiameter / 2 - JOIN_OVERLAP,
            ]),
          )
    const solid = own(Manifold.union([body, connection]))
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
