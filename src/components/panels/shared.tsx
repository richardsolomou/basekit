import { Code2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { maxHolderSlotDepth, minHolderHeight } from '@/geometry/holder'
import { DEFAULT_PRESET, presetFor } from '@/geometry/presets'
import { maxProfileSize } from '@/geometry/profile'
import type { BaseConfig, EdgeProfile, HolderConfig, MagnetLayout } from '@/geometry/types'

export const PROFILES: { value: EdgeProfile; label: string }[] = [
  { value: 'taper', label: 'Taper' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'round', label: 'Round' },
  { value: 'straight', label: 'Straight' },
]

export const MAGNET_LAYOUTS: { value: MagnetLayout; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'five-cross', label: 'Five-pocket cross' },
]
export const AUTOMATIC_MAGNET_COUNT = 'auto'
export type MagnetCountChoice = number | typeof AUTOMATIC_MAGNET_COUNT
export const BASE_DEFAULTS = presetFor(DEFAULT_PRESET)

export type SharedMagnetChanges = Partial<Pick<BaseConfig['magnets'], 'layout' | 'diameter' | 'thickness' | 'clearance' | 'depthClearance'>>
export type SharedMagnetPlacementChanges = Partial<Pick<BaseConfig, 'wallThickness'> & { bossWall: number }>

export const safeEdgeSize = (next: BaseConfig) => Math.floor((maxProfileSize(next) + 1e-6) * 10) / 10

export const fitSlotDepth = (next: HolderConfig) => ({
  ...next,
  ...(maxHolderSlotDepth(next) < 1
    ? { height: minHolderHeight({ ...next, slotDepth: 1 }), slotDepth: 1 }
    : { slotDepth: Math.min(next.slotDepth, Math.floor(maxHolderSlotDepth(next) / 0.5) * 0.5) }),
})

export function RepositoryLink() {
  return (
    <div className="flex justify-center px-5 pt-4">
      <a
        href="https://github.com/richardsolomou/basekit"
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: 'link', size: 'sm', className: 'text-muted-foreground' })}
      >
        <Code2 className="size-3.5" />
        GitHub
      </a>
    </div>
  )
}
