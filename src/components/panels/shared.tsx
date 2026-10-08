import { Code2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
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

export interface ResetAction {
  label: string
  description: string
  onReset: () => void
}

function ResetButton({ label, description, onReset }: ResetAction) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="text-muted-foreground" />}>
        <RotateCcw />
        Reset {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset {label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onReset()
              setOpen(false)
            }}
          >
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function PanelFooter({ resets }: { resets: ResetAction[] }) {
  return (
    <div className="flex flex-col items-center gap-1 border-t border-border px-5 pt-4">
      <div className="flex flex-wrap justify-center gap-1">
        {resets.map((reset) => (
          <ResetButton key={reset.label} {...reset} />
        ))}
      </div>
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
