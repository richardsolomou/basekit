/** Canonical Gridfinity dimensions shared by holder feet and rack sockets. */
export const GRIDFINITY_PITCH = 42
export const GRIDFINITY_FOOT_CLEARANCE = 0.5
export const GRIDFINITY_CORNER_RADIUS = 3.75
export const GRIDFINITY_HEIGHT_UNIT = 7

/** Foot outline inset at each height above its bottom face. */
export const GRIDFINITY_FOOT_PROFILE = [
  { inset: 2.95, z: 0 },
  { inset: 2.15, z: 0.8 },
  { inset: 2.15, z: 2.6 },
  { inset: 0, z: 4.75 },
] as const

export const GRIDFINITY_FOOT_HEIGHT = GRIDFINITY_FOOT_PROFILE.at(-1)!.z
export const GRIDFINITY_FOOT_SIZE = GRIDFINITY_PITCH - GRIDFINITY_FOOT_CLEARANCE
