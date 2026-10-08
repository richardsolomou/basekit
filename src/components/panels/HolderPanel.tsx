import { useEffect, useMemo, useState } from 'react'
import { Choice, Dimension, Section, ToggleSetting } from '@/components/controls'
import { MiniatureGroupsEditor } from '@/components/MiniatureGroupsEditor'
import { FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supportsFivePocketCross } from '@/geometry/base'
import {
  defaultHolderConfig,
  holderGroupLabel,
  holderSpareCapacity,
  maxHolderSlotDepth,
  minHolderHeight,
  type holderLayout,
  type holderPlan,
} from '@/geometry/holder'
import { trimNumber } from '@/geometry/outline'
import type { HolderConfig, HolderGroup } from '@/geometry/types'
import { BASE_DEFAULTS, fitSlotDepth, MAGNET_LAYOUTS, RepositoryLink, type SharedMagnetChanges } from './shared'

const HOLDER_DEFAULTS = defaultHolderConfig()
const SPARE_ROOM_SETTLE_MS = 200
const NO_SPARE_ROOM = new Map<string, number>()
const ENGRAVING_PLACEMENTS = [
  { value: 'slots' as const, label: 'In slots' },
  { value: 'module' as const, label: 'On module' },
]

function fittedCounts(modules: { config: { groups: HolderGroup[] } }[]) {
  const fitted = new Map<string, number>()
  for (const module of modules) {
    for (const group of module.config.groups) fitted.set(group.id, (fitted.get(group.id) ?? 0) + group.quantity)
  }
  return fitted
}

interface Props {
  holder: HolderConfig
  setHolder: (holder: HolderConfig) => void
  holderSize: ReturnType<typeof holderLayout>
  plan: ReturnType<typeof holderPlan>
  maxSharedMagnetThickness: number
  setSharedMagnets: (changes: SharedMagnetChanges) => void
  setSharedLabels: (enabled: boolean) => void
}

export function HolderPanel({ holder, setHolder, holderSize, plan, maxSharedMagnetThickness, setSharedMagnets, setSharedLabels }: Props) {
  const maxSlotDepth = Math.max(1, Math.floor(maxHolderSlotDepth(holder) / 0.5) * 0.5)
  const requestedModels = useMemo(() => holder.groups.reduce((total, group) => total + group.quantity, 0), [holder.groups])
  const fittedByGroup = useMemo(() => fittedCounts(plan.modules), [plan])
  const [spareRoom, setSpareRoom] = useState<{ holder: HolderConfig; byGroup: Map<string, number> }>()
  useEffect(() => {
    // Re-planning for spare room costs far more than a preview, so it waits for edits to settle instead of blocking a scrub.
    const timer = setTimeout(
      () => setSpareRoom({ holder, byGroup: new Map(holder.groups.map((group) => [group.id, holderSpareCapacity(holder, group.id)])) }),
      SPARE_ROOM_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [holder])
  const spareByGroup = spareRoom?.holder === holder ? spareRoom.byGroup : NO_SPARE_ROOM
  const holderSupportsFiveCross =
    holder.magnets.patternVersion === 1 || holder.groups.some((group) => supportsFivePocketCross(group.shape, group.width))
  const holderMagnetLayout = holderSupportsFiveCross ? holder.magnets.layout : 'balanced'
  const holderMagnetLayoutOptions = holderSupportsFiveCross ? MAGNET_LAYOUTS : MAGNET_LAYOUTS.slice(0, 1)

  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Holder settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Miniatures"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holderSize.slotCenters.length}/{requestedModels} fitted
            </span>
          }
        >
          <MiniatureGroupsEditor
            groups={holder.groups}
            fittedByGroup={fittedByGroup}
            spareByGroup={spareByGroup}
            onChange={(groups) => setHolder({ ...holder, groups })}
          />
        </Section>

        <Section
          title="Layout"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holderSize.unitsWide} × {holderSize.unitsDeep} used
            </span>
          }
        >
          <Dimension
            label="Maximum columns"
            value={holder.maxColumns}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={HOLDER_DEFAULTS.maxColumns}
            onChange={(maxColumns) => setHolder({ ...holder, maxColumns: Math.round(maxColumns) })}
          />
          <Dimension
            label="Maximum rows"
            value={holder.maxRows}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={HOLDER_DEFAULTS.maxRows}
            onChange={(maxRows) => setHolder({ ...holder, maxRows: Math.round(maxRows) })}
          />
          <Dimension
            label="Between miniatures"
            value={holder.spacing}
            min={0}
            max={10}
            step={0.5}
            defaultValue={HOLDER_DEFAULTS.spacing}
            onChange={(spacing) =>
              setHolder({
                ...holder,
                spacing,
                edgeSpacing: holder.edgeSpacing === holder.spacing / 2 ? spacing / 2 : holder.edgeSpacing,
              })
            }
          />
          <Dimension
            label="From holder edge"
            value={holder.edgeSpacing}
            min={0}
            max={10}
            step={0.05}
            defaultValue={holder.spacing / 2}
            onChange={(edgeSpacing) => setHolder({ ...holder, edgeSpacing })}
          />
          <ToggleSetting
            label="Split into modules"
            checked={holder.splitGroups}
            defaultChecked={HOLDER_DEFAULTS.splitGroups}
            onChange={(splitGroups) => setHolder({ ...holder, splitGroups })}
          />
          <div className="space-y-1 border-y border-border py-3 text-xs">
            {plan.modules.map((module, index) => (
              <div
                key={`${module.config.groups[0].id}-${module.column}-${module.row}`}
                className="flex flex-wrap justify-between gap-x-3 gap-y-1"
              >
                <span className="text-muted-foreground">Module {index + 1}</span>
                <span className="readout text-right">
                  {module.config.groups.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' + ')} ·{' '}
                  {module.layout.unitsWide}×{module.layout.unitsDeep}
                </span>
              </div>
            ))}
          </div>
          <Dimension
            label="Holder height"
            value={holder.height}
            min={minHolderHeight(holder)}
            max={42}
            step={7}
            defaultValue={HOLDER_DEFAULTS.height}
            onChange={(height) => setHolder({ ...holder, height })}
          />
        </Section>

        <Section title="Slots" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(holder.slotDepth)}mm deep</span>}>
          <Dimension
            label="Slot depth"
            value={holder.slotDepth}
            min={1}
            max={maxSlotDepth}
            step={0.5}
            defaultValue={HOLDER_DEFAULTS.slotDepth}
            onChange={(slotDepth) => setHolder({ ...holder, slotDepth })}
          />
          <Dimension
            label="Slot clearance"
            value={holder.slotClearance}
            min={0.1}
            max={2}
            step={0.1}
            defaultValue={HOLDER_DEFAULTS.slotClearance}
            onChange={(slotClearance) => setHolder({ ...holder, slotClearance })}
          />
          <ToggleSetting
            label="Size labels"
            checked={holder.engraving.enabled}
            defaultChecked={HOLDER_DEFAULTS.engraving.enabled}
            onChange={setSharedLabels}
          />
          {holder.engraving.enabled && (
            <Choice
              label="Label location"
              value={holder.engraving.placement}
              defaultValue={HOLDER_DEFAULTS.engraving.placement}
              options={ENGRAVING_PLACEMENTS}
              onChange={(placement) => setHolder(fitSlotDepth({ ...holder, engraving: { ...holder.engraving, placement } }))}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holder.magnets.enabled ? `${trimNumber(holder.magnets.diameter + holder.magnets.clearance)} mm hole` : 'none'}
            </span>
          }
        >
          <ToggleSetting
            label="Slot magnets"
            checked={holder.magnets.enabled}
            defaultChecked={HOLDER_DEFAULTS.magnets.enabled}
            onChange={(enabled) => setHolder(fitSlotDepth({ ...holder, magnets: { ...holder.magnets, enabled } }))}
          />
          {holder.magnets.enabled && (
            <>
              <Choice
                label="Pocket layout"
                value={holderMagnetLayout}
                defaultValue={HOLDER_DEFAULTS.magnets.layout}
                options={holderMagnetLayoutOptions}
                onChange={(layout) => setSharedMagnets({ layout })}
              />
              <Dimension
                label="Magnet diameter"
                value={holder.magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={holder.magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
              <Dimension
                label="Magnet diameter clearance"
                value={holder.magnets.clearance}
                min={0}
                max={0.6}
                step={0.05}
                defaultValue={BASE_DEFAULTS.magnets.clearance}
                onChange={(clearance) => setSharedMagnets({ clearance })}
              />
              <Dimension
                label="Magnet depth clearance"
                value={holder.magnets.depthClearance}
                min={0}
                max={0.5}
                step={0.05}
                defaultValue={HOLDER_DEFAULTS.magnets.depthClearance}
                onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
              />
              <FieldDescription>Automatic base recommendations also apply to matching holder slots.</FieldDescription>
            </>
          )}
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
}
