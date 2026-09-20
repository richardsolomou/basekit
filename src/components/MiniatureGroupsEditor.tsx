import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CompactChoice, Dimension, SizeSelect } from '@/components/controls'
import { Button } from '@/components/ui/button'
import { holderGroup } from '@/geometry/holder'
import { isElongated } from '@/geometry/outline'
import { SIZES_BY_SHAPE } from '@/geometry/presets'
import type { HolderGroup, ShapeKind } from '@/geometry/types'
import posthog from '@/lib/posthog'

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'polygon', label: 'Hex' },
]
const SIZE_PRESETS = Object.values(SIZES_BY_SHAPE).flat()
const CUSTOM_SIZE = 'custom'

function sizePreset(group: Pick<HolderGroup, 'shape' | 'width' | 'length'>) {
  return SIZE_PRESETS.find(
    (size) => size.shape === group.shape && size.width === group.width && (size.length ?? size.width) === group.length,
  )
}

interface Props {
  groups: HolderGroup[]
  fittedByGroup: Map<string, number>
  onChange: (groups: HolderGroup[]) => void
}

export function MiniatureGroupsEditor({ groups, fittedByGroup, onChange }: Props) {
  const [customGroups, setCustomGroups] = useState<Set<string>>(() => new Set())
  const setCustom = (id: string, custom: boolean) =>
    setCustomGroups((current) => {
      const next = new Set(current)
      if (custom) next.add(id)
      else next.delete(id)
      return next
    })
  const replace = (index: number, group: HolderGroup) => onChange(groups.map((entry, groupIndex) => (groupIndex === index ? group : entry)))
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    const next = [...groups]
    const current = next[index]
    next[index] = next[target]
    next[target] = current
    onChange(next)
  }

  return (
    <>
      <p className="text-[0.625rem] text-muted-foreground">Priority runs from top to bottom.</p>
      <div className="grid grid-cols-[3rem_5.5rem_minmax(0,1fr)] gap-2 px-1 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
        <span>Qty</span>
        <span>Shape</span>
        <span>Size</span>
      </div>
      {groups.map((group, index) => {
        const standard = sizePreset(group)
        const customOpen = customGroups.has(group.id) || !standard
        const fitted = fittedByGroup.get(group.id) ?? 0
        const missing = group.quantity - fitted
        return (
          <div
            key={group.id}
            className={`grid grid-cols-[3rem_5.5rem_minmax(0,1fr)] items-center gap-2 border-b pb-2 last:border-0 ${
              missing > 0 ? 'border-destructive/50' : 'border-border'
            }`}
          >
            <Dimension
              label={`Quantity ${index + 1}`}
              value={group.quantity}
              min={1}
              max={100}
              step={1}
              unit=""
              compact
              onChange={(quantity) => replace(index, { ...group, quantity: Math.round(quantity) })}
            />
            <CompactChoice
              label={`Shape ${index + 1}`}
              value={group.shape}
              options={SHAPES}
              onChange={(shape) => {
                setCustom(group.id, false)
                replace(index, holderGroup(group.id, group.quantity, { shape }))
              }}
            />
            <SizeSelect
              compact
              label={`Standard base size ${index + 1}`}
              value={customOpen ? CUSTOM_SIZE : (standard?.label ?? CUSTOM_SIZE)}
              options={[
                ...SIZES_BY_SHAPE[group.shape].map((size) => ({ value: size.label, use: size.use })),
                { value: CUSTOM_SIZE, label: 'Custom', use: 'exact dimensions' },
              ]}
              onChange={(value) => {
                if (value === CUSTOM_SIZE) {
                  setCustom(group.id, true)
                  return
                }
                const size = SIZES_BY_SHAPE[group.shape].find((candidate) => candidate.label === value)
                if (!size) return
                setCustom(group.id, false)
                replace(
                  index,
                  holderGroup(group.id, group.quantity, {
                    shape: size.shape,
                    width: size.width,
                    length: size.length ?? size.width,
                  }),
                )
              }}
            />
            {customOpen && (
              <div className="col-span-3 grid grid-cols-[minmax(4.5rem,1fr)_minmax(5.5rem,1fr)] gap-2 pl-[calc(3rem+0.5rem)]">
                <Dimension
                  label={`${isElongated(group.shape) ? 'Base width' : group.shape === 'round' ? 'Base diameter' : 'Overall width'} ${index + 1}`}
                  compactLabel={isElongated(group.shape) ? 'Width' : group.shape === 'round' ? 'Diameter' : 'Overall width'}
                  value={group.width}
                  min={15}
                  max={180}
                  step={0.5}
                  compact
                  onChange={(width) => replace(index, { ...group, width, length: isElongated(group.shape) ? group.length : width })}
                />
                {isElongated(group.shape) && (
                  <Dimension
                    label={`Base depth ${index + 1}`}
                    compactLabel="Depth"
                    value={group.length}
                    min={15}
                    max={180}
                    step={0.5}
                    compact
                    onChange={(length) => replace(index, { ...group, length })}
                  />
                )}
              </div>
            )}
            <div className="col-span-3 flex min-w-0 items-center justify-between gap-2 pl-[calc(3rem+0.5rem)]">
              {missing > 0 && (
                <p className="min-w-0 truncate text-xs text-destructive">
                  {fitted === 0 ? `None of ${group.quantity} fit` : `Only ${fitted} of ${group.quantity} fit`}
                </p>
              )}
              <div className="ms-auto flex shrink-0">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Increase priority of miniature group ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Decrease priority of miniature group ${index + 1}`}
                  disabled={index === groups.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove miniature group ${index + 1}`}
                  disabled={groups.length === 1}
                  onClick={() => {
                    posthog.capture('holder_group_removed', { group_count: groups.length })
                    onChange(groups.filter((_, groupIndex) => groupIndex !== index))
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        )
      })}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          posthog.capture('holder_group_added', { group_count: groups.length + 1 })
          onChange([...groups, holderGroup(crypto.randomUUID(), 1, { width: 40 })])
        }}
      >
        <Plus /> Add size
      </Button>
    </>
  )
}
