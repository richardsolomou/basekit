import type { EdgeProfile } from './types'

/** One horizontal slice of the body: the outline pulled in by `inset` at height `z`. */
export interface ProfileStep {
  inset: number
  z: number
}

/**
 * Slices describing the outer wall from the bottom face up to the top face. The
 * edge treatment always sits at the bottom, so the full nominal size lands on the
 * top face where the miniature goes.
 *
 * Insets shrink monotonically with height, which keeps the lofted body convex.
 */
export function profileSteps(height: number, profile: EdgeProfile, size: number, segments: number): ProfileStep[] {
  const s = Math.max(0, Math.min(size, height - 0.1))
  if (profile === 'straight' || s <= 0) {
    return [
      { inset: 0, z: 0 },
      { inset: 0, z: height },
    ]
  }

  if (profile === 'taper') {
    return [
      { inset: s, z: 0 },
      { inset: 0, z: height },
    ]
  }

  if (profile === 'bevel') {
    return [
      { inset: s, z: 0 },
      { inset: 0, z: s },
      { inset: 0, z: height },
    ]
  }

  // Quarter-round from the bottom face up to the full-size wall.
  const steps = Math.max(3, Math.round(segments / 12))
  const arc: ProfileStep[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI / 2) * (i / steps)
    arc.push({ inset: s - s * Math.sin(a), z: s - s * Math.cos(a) })
  }
  return [...arc, { inset: 0, z: height }]
}
