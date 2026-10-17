/** Maximum chord error for exported circular geometry, in millimetres. */
export const EXPORT_CURVE_TOLERANCE = 0.001

/** Segments needed around a circle to stay within a chord tolerance. */
export function segmentsForTolerance(diameter: number, tolerance: number): number {
  const radius = diameter / 2
  if (radius <= tolerance) return 3
  return Math.ceil(Math.PI / Math.acos(1 - tolerance / radius))
}

export const curveTolerance = (diameter: number, segments: number): number => (diameter / 2) * (1 - Math.cos(Math.PI / segments))

export const previewSegmentsFor = (diameter: number): number => Math.min(256, Math.max(64, Math.ceil(diameter * 3.2)))

export const exportSegmentsFor = (diameter: number): number => segmentsForTolerance(diameter, EXPORT_CURVE_TOLERANCE)
