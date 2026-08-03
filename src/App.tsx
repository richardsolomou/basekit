import { Box, ChevronDown, ChevronUp, Code2, Download, PanelLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Choice, CompactChoice, Dimension, Section, SizeSelect, ToggleSetting } from '@/components/controls'
import { Button, buttonVariants } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import {
  defaultHolderConfig,
  holderGroup,
  holderGroupLabel,
  holderLayout,
  holderName,
  holderPlan,
  maxHolderMagnetThickness,
  maxHolderSlotDepth,
} from '@/geometry/holder'
import { baseName, defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import {
  DEFAULT_PRESET,
  DEFAULT_SIZE,
  footprintKey,
  MAGNET_CHOICES,
  presetFor,
  resized,
  RIB_CHOICES,
  SIZES_BY_SHAPE,
  type SizePreset,
} from '@/geometry/presets'
import { maxProfileSize } from '@/geometry/profile'
import type { BaseConfig, EdgeProfile, HolderConfig, ShapeKind, Underside } from '@/geometry/types'
import { useExport } from '@/lib/useExport'
import { useGenerator } from '@/lib/useGenerator'
import { useMediaQuery } from '@/lib/useMediaQuery'
import posthog from '@/lib/posthog'
import { loadWorkspace, saveWorkspace, synchronizeWorkspace, type WorkspaceState } from '@/lib/workspace'

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'polygon', label: 'Hex' },
]

const HOLDER_SIZE_PRESETS = Object.values(SIZES_BY_SHAPE).flat()
const CUSTOM_HOLDER_SIZE = 'custom'

function holderSizePreset(group: { shape: ShapeKind; width: number; length: number }) {
  return HOLDER_SIZE_PRESETS.find(
    (size) => size.shape === group.shape && size.width === group.width && (size.length ?? size.width) === group.length,
  )
}

const PROFILES: { value: EdgeProfile; label: string }[] = [
  { value: 'taper', label: 'Taper' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'round', label: 'Round' },
  { value: 'straight', label: 'Straight' },
]

const UNDERSIDES: { value: Underside; label: string }[] = [
  { value: 'well', label: 'Hollow' },
  { value: 'solid', label: 'Solid' },
]

const counts = (values: number[]) => values.map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
const MAGNET_COUNTS = counts(MAGNET_CHOICES)
const RIB_COUNTS = counts(RIB_CHOICES)
const MODELS = [
  { value: 'base' as const, label: 'Bases', href: '/' },
  { value: 'holder' as const, label: 'Holders', href: '/holders' },
]
const ENGRAVING_PLACEMENTS = [
  { value: 'slots' as const, label: 'In slots' },
  { value: 'module' as const, label: 'On module' },
]
const BASE_DEFAULTS = presetFor(DEFAULT_PRESET)
const HOLDER_DEFAULTS = defaultHolderConfig()

const modelForPath = (): 'base' | 'holder' => (window.location.pathname === '/holders' ? 'holder' : 'base')

function withRememberedMagnetCount(config: BaseConfig, magnetCounts: Record<string, number>): BaseConfig {
  const count = magnetCounts[footprintKey(config.shape, config.width, config.length)]
  return count === undefined ? config : { ...config, magnets: { ...config.magnets, count } }
}

function RepositoryLink() {
  return (
    <div className="flex justify-center px-5 pt-4">
      <a
        href="https://github.com/richardsolomou/mini-bases"
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

export function App() {
  const [workspace, setWorkspaceState] = useState(loadWorkspace)
  const config = workspace.base
  const holder = workspace.holder
  const setWorkspace = (next: WorkspaceState | ((current: WorkspaceState) => WorkspaceState)) =>
    setWorkspaceState((current) => synchronizeWorkspace(typeof next === 'function' ? next(current) : next))
  const setConfig = (next: BaseConfig | ((current: BaseConfig) => BaseConfig)) =>
    setWorkspace((current) => ({ ...current, base: typeof next === 'function' ? next(current.base) : next }))
  const setHolder = (next: HolderConfig | ((current: HolderConfig) => HolderConfig)) =>
    setWorkspace((current) => ({ ...current, holder: typeof next === 'function' ? next(current.holder) : next }))
  const [customBaseSize, setCustomBaseSize] = useState(false)
  const [customHolderGroups, setCustomHolderGroups] = useState<Set<string>>(() => new Set())
  const [model, setModel] = useState<'base' | 'holder'>(modelForPath)
  // Tailwind's `md`, the width at which the panel stops needing to slide in.
  const docked = useMediaQuery('(min-width: 48rem)')
  const partConfig = model === 'base' ? config : holder
  const { preview, error } = useGenerator(partConfig)

  useEffect(() => saveWorkspace(workspace), [workspace])

  useEffect(() => {
    const syncRoute = () => setModel(modelForPath())
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  useEffect(() => {
    document.title = model === 'holder' ? 'Gridfinity Mini Holders' : 'Mini Bases'
  }, [model])

  const changeModel = (next: 'base' | 'holder') => {
    if (next === model) return
    setWorkspace((current) => {
      if (next === 'holder') {
        const groups = [...current.holder.groups]
        groups[0] = holderGroup(groups[0].id, groups[0].quantity, {
          shape: current.base.shape,
          width: current.base.width,
          length: current.base.length,
          cornerRadius: current.base.cornerRadius,
          sides: current.base.sides,
        })
        return { ...current, holder: { ...current.holder, groups } }
      }
      const group = current.holder.groups[0]
      const base = resized(
        { ...current.base, shape: group.shape, cornerRadius: group.cornerRadius, sides: group.sides },
        group.width,
        group.length,
      )
      return { ...current, base: withRememberedMagnetCount(base, current.holder.magnetCounts) }
    })
    window.history.pushState(null, '', next === 'holder' ? '/holders' : '/')
    setModel(next)
  }

  const safeEdgeSize = (next: BaseConfig) => Math.floor((maxProfileSize(next) + 1e-6) * 10) / 10
  const patch = (changes: Partial<BaseConfig>) =>
    setConfig((current) => {
      const next = { ...current, ...changes }
      return { ...next, profileSize: Math.min(next.profileSize, safeEdgeSize(next)) }
    })
  const { width, length } = footprint(config)
  const holderSize = useMemo(() => holderLayout(holder), [holder])
  const maxSlotDepth = Math.max(1, Math.floor(maxHolderSlotDepth(holder) / 0.5) * 0.5)
  const maxBaseMagnetThickness =
    config.underside === 'well' ? Math.max(0.5, config.height - config.floorThickness) : Math.max(1, config.height - 0.4)
  const maxSharedMagnetThickness = Math.max(0.5, Math.min(maxBaseMagnetThickness, Math.floor(maxHolderMagnetThickness(holder) * 10) / 10))
  const fitSlotDepth = (next: HolderConfig) => ({
    ...next,
    slotDepth: Math.min(next.slotDepth, Math.max(1, Math.floor(maxHolderSlotDepth(next) / 0.5) * 0.5)),
  })
  const plan = useMemo(() => holderPlan(holder), [holder])
  const requestedModels = useMemo(() => holder.groups.reduce((total, group) => total + group.quantity, 0), [holder.groups])
  const fittedByGroup = useMemo(() => {
    const fitted = new Map<string, number>()
    for (const module of plan.modules) {
      for (const group of module.config.groups) fitted.set(group.id, (fitted.get(group.id) ?? 0) + group.quantity)
    }
    return fitted
  }, [plan])
  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= holder.groups.length) return
    const groups = [...holder.groups]
    const current = groups[index]
    groups[index] = groups[target]
    groups[target] = current
    setHolder({ ...holder, groups })
  }
  const showCustomHolderGroup = (id: string) =>
    setCustomHolderGroups((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  const hideCustomHolderGroup = (id: string) =>
    setCustomHolderGroups((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  const partWidth = model === 'base' ? width : holderSize.width
  const partLength = model === 'base' ? length : holderSize.length
  const partHeight = model === 'base' ? config.height : holder.height
  const partName = model === 'base' ? baseName(config) : holderName(holder)
  const {
    exporting,
    error: exportError,
    exportStl,
    export3mf,
  } = useExport({
    model,
    base: config,
    holder,
    width: partWidth,
    length: partLength,
  })
  const elongated = isElongated(config.shape)
  const hollow = config.underside === 'well'
  const sizes = SIZES_BY_SHAPE[config.shape]
  const standard = sizes.find((size) => size.width === width && (size.length ?? size.width) === length)

  const loadPreset = (size: SizePreset) => {
    posthog.capture('base_size_selected', { size: size.label, shape: config.shape })
    setCustomBaseSize(false)
    const next = presetFor(size)
    setConfig(
      withRememberedMagnetCount(
        {
          ...next,
          magnets: {
            ...next.magnets,
            diameter: config.magnets.diameter,
            thickness: config.magnets.thickness,
            clearance: config.magnets.clearance,
          },
        },
        holder.magnetCounts,
      ),
    )
  }

  const setSharedMagnets = (changes: Partial<Pick<BaseConfig['magnets'], 'diameter' | 'thickness' | 'clearance'>>) => {
    setWorkspace((current) => ({
      ...current,
      shared: { ...current.shared, magnets: { ...current.shared.magnets, ...changes } },
    }))
  }

  const setSharedLabels = (labelsEnabled: boolean) =>
    setWorkspace((current) => ({
      ...current,
      shared: { ...current.shared, labelsEnabled },
      holder: labelsEnabled
        ? fitSlotDepth({ ...current.holder, engraving: { ...current.holder.engraving, enabled: true } })
        : current.holder,
    }))

  const setSharedMagnetPlacement = (changes: Partial<Pick<BaseConfig, 'wallThickness'> & { bossWall: number }>) => {
    setWorkspace((current) => {
      const base = {
        ...current.base,
        ...('wallThickness' in changes ? { wallThickness: changes.wallThickness } : {}),
        magnets: { ...current.base.magnets, ...('bossWall' in changes ? { bossWall: changes.bossWall } : {}) },
      }
      return {
        ...current,
        base: { ...base, profileSize: Math.min(base.profileSize, safeEdgeSize(base)) },
        holder: {
          ...current.holder,
          ...('wallThickness' in changes ? { baseWallThickness: changes.wallThickness } : {}),
          ...('bossWall' in changes ? { magnetBossWall: changes.bossWall } : {}),
        },
      }
    })
  }

  const setMagnetCount = (count: number) => {
    const key = footprintKey(config.shape, config.width, config.length)
    setWorkspace((current) => ({
      ...current,
      base: { ...current.base, magnets: { ...current.base.magnets, count } },
      holder: { ...current.holder, magnetCounts: { ...current.holder.magnetCounts, [key]: count } },
    }))
  }

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    posthog.capture('base_shape_selected', { shape })
    const target = DEFAULT_SIZE[shape]
    setCustomBaseSize(false)
    const next = resized({ ...config, shape }, target.width, target.length ?? target.width)
    setConfig(withRememberedMagnetCount(next, holder.magnetCounts))
  }

  const basePanel = (
    <ScrollArea className="h-full w-80 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      {/* Sections number themselves off this counter, in the order they appear. */}
      <aside aria-label="Base settings" className="pb-4 [counter-reset:schedule]">
        <Section title="Size & Shape">
          <Choice label="Shape" value={config.shape} defaultValue={BASE_DEFAULTS.shape} options={SHAPES} onChange={changeShape} />
          <SizeSelect
            value={!customBaseSize && standard ? standard.label : CUSTOM_HOLDER_SIZE}
            options={[
              ...sizes.map((size) => ({ value: size.label, use: size.use })),
              { value: CUSTOM_HOLDER_SIZE, label: 'Custom', use: 'exact dimensions' },
            ]}
            onChange={(label) => {
              if (label === CUSTOM_HOLDER_SIZE) {
                setCustomBaseSize(true)
                return
              }
              const size = sizes.find((s) => s.label === label)
              if (size) loadPreset(size)
            }}
          />
          {customBaseSize && (
            <Dimension
              label={elongated ? 'Width' : config.shape === 'round' ? 'Diameter' : 'Overall width'}
              value={config.width}
              min={15}
              max={180}
              step={0.5}
              defaultValue={BASE_DEFAULTS.width}
              onChange={(w) => {
                const next = resized(config, w, config.length)
                setConfig(withRememberedMagnetCount(next, holder.magnetCounts))
              }}
            />
          )}
          {customBaseSize && elongated && (
            <Dimension
              label="Depth"
              value={config.length}
              min={15}
              max={180}
              step={0.5}
              defaultValue={BASE_DEFAULTS.length}
              onChange={(l) => {
                const next = resized(config, config.width, l)
                setConfig(withRememberedMagnetCount(next, holder.magnetCounts))
              }}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(config.magnets.diameter + config.magnets.clearance)} mm hole
            </span>
          }
        >
          <Dimension
            label="Magnet diameter"
            value={config.magnets.diameter}
            min={2}
            max={8}
            step={0.5}
            defaultValue={BASE_DEFAULTS.magnets.diameter}
            disabled={config.magnets.count === 0}
            onChange={(diameter) => setSharedMagnets({ diameter })}
          />
          <Dimension
            label="Magnet thickness"
            value={config.magnets.thickness}
            min={0.5}
            max={maxSharedMagnetThickness}
            step={0.1}
            defaultValue={BASE_DEFAULTS.magnets.thickness}
            disabled={config.magnets.count === 0}
            onChange={(thickness) => setSharedMagnets({ thickness })}
          />
        </Section>

        <Section title="Size Label">
          <ToggleSetting
            label="Show size label"
            checked={config.label.enabled}
            defaultChecked={BASE_DEFAULTS.label.enabled}
            onChange={(enabled) => {
              posthog.capture('base_marking_toggled', { enabled })
              setSharedLabels(enabled)
            }}
          />
          <Field>
            <FieldLabel htmlFor="marking-text" className="sr-only">
              Label text
            </FieldLabel>
            <Input
              id="marking-text"
              value={config.label.text ?? ''}
              placeholder={defaultLabel(config)}
              disabled={!config.label.enabled || !hollow}
              onChange={(e) => patch({ label: { ...config.label, text: e.currentTarget.value } })}
              className="readout"
            />
            {!hollow && <FieldDescription>A solid base has no well to emboss. Switch the underside under Construction.</FieldDescription>}
          </Field>
        </Section>

        <Section title="Construction" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(config.height)}mm</span>}>
          <Choice
            label="Underside"
            value={config.underside}
            defaultValue={BASE_DEFAULTS.underside}
            options={UNDERSIDES}
            onChange={(underside) => patch({ underside })}
          />
          <Dimension
            label="Height"
            value={config.height}
            min={2}
            max={12}
            step={0.25}
            defaultValue={BASE_DEFAULTS.height}
            onChange={(height) => patch({ height })}
          />
          <Dimension
            label="Wall thickness"
            value={config.wallThickness}
            min={1}
            max={6}
            step={0.1}
            defaultValue={BASE_DEFAULTS.wallThickness}
            onChange={(wallThickness) => setSharedMagnetPlacement({ wallThickness })}
          />
          {/* Only a hollowed underside has a floor to set. It is the face the model
                is glued to, and it is never between a magnet and the tray. */}
          {hollow && (
            <Dimension
              label="Top thickness"
              value={config.floorThickness}
              min={0.4}
              max={Math.max(0.5, config.height - 0.5)}
              step={0.1}
              defaultValue={BASE_DEFAULTS.floorThickness}
              onChange={(floorThickness) => patch({ floorThickness })}
            />
          )}
          <Choice
            label="Bottom edge"
            value={config.profile}
            defaultValue={BASE_DEFAULTS.profile}
            options={PROFILES}
            onChange={(profile) => patch({ profile })}
          />
          <Dimension
            label="Edge size"
            value={config.profileSize}
            min={0}
            max={safeEdgeSize(config)}
            step={0.1}
            defaultValue={BASE_DEFAULTS.profileSize}
            disabled={config.profile === 'straight'}
            onChange={(profileSize) => patch({ profileSize })}
          />
          {config.shape === 'rect' && (
            <Dimension
              label="Corner radius"
              value={config.cornerRadius}
              min={0}
              max={12}
              step={0.5}
              defaultValue={BASE_DEFAULTS.cornerRadius}
              onChange={(cornerRadius) => patch({ cornerRadius })}
            />
          )}
          {config.shape === 'polygon' && (
            <Dimension
              label="Sides"
              value={config.sides}
              min={3}
              max={12}
              step={1}
              unit=""
              defaultValue={BASE_DEFAULTS.sides}
              onChange={(sides) => patch({ sides })}
            />
          )}
        </Section>

        <Section
          title="Magnet layout"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.magnets.count === 0 ? 'none' : `${config.magnets.count} ${config.magnets.count === 1 ? 'pocket' : 'pockets'}`}
            </span>
          }
        >
          <Choice
            label="Magnets per base"
            value={config.magnets.count}
            defaultValue={BASE_DEFAULTS.magnets.count}
            options={MAGNET_COUNTS}
            onChange={setMagnetCount}
          />
        </Section>

        <Section
          title="Internal Supports"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.ribs.count === 0 ? 'none' : `${config.ribs.count} spokes`}
            </span>
          }
        >
          <Choice
            label="Number of supports"
            value={config.ribs.count}
            defaultValue={BASE_DEFAULTS.ribs.count}
            options={RIB_COUNTS}
            onChange={(count) => patch({ ribs: { ...config.ribs, count } })}
          />
          <Dimension
            label="Thickness"
            value={config.ribs.thickness}
            min={0.8}
            max={4}
            step={0.1}
            defaultValue={BASE_DEFAULTS.ribs.thickness}
            disabled={config.ribs.count === 0}
            onChange={(thickness) => patch({ ribs: { ...config.ribs, thickness } })}
          />
          <Dimension
            label="Height"
            value={config.ribs.height}
            min={0.4}
            max={Math.max(0.5, config.height - config.floorThickness)}
            step={0.1}
            defaultValue={BASE_DEFAULTS.ribs.height}
            disabled={config.ribs.count === 0}
            onChange={(height) => patch({ ribs: { ...config.ribs, height } })}
          />
        </Section>

        <Section
          title="Fit & Detail"
          aside={<span className="readout text-xs text-muted-foreground">Ø{trimNumber(config.magnets.clearance)} fit</span>}
        >
          <Dimension
            label="Magnet fit clearance"
            value={config.magnets.clearance}
            min={0}
            max={0.6}
            step={0.05}
            defaultValue={BASE_DEFAULTS.magnets.clearance}
            onChange={(clearance) => setSharedMagnets({ clearance })}
          />
          <Dimension
            label="Wall around pocket"
            value={config.magnets.bossWall}
            min={0.4}
            max={3}
            step={0.1}
            defaultValue={BASE_DEFAULTS.magnets.bossWall}
            onChange={(bossWall) => setSharedMagnetPlacement({ bossWall })}
          />
          <Dimension
            label="Label size"
            value={config.label.height}
            min={2}
            max={16}
            step={0.5}
            defaultValue={BASE_DEFAULTS.label.height}
            disabled={!config.label.enabled}
            onChange={(height) => patch({ label: { ...config.label, height } })}
          />
          <Dimension
            label="Label thickness"
            value={config.label.emboss}
            min={0.2}
            max={1.5}
            step={0.1}
            defaultValue={BASE_DEFAULTS.label.emboss}
            disabled={!config.label.enabled}
            onChange={(emboss) => patch({ label: { ...config.label, emboss } })}
          />
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )

  const holderPanel = (
    <ScrollArea className="h-full w-80 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Holder settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Miniatures"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {holderSize.slotCenters.length}/{requestedModels} fitted
            </span>
          }
        >
          <p className="text-[0.625rem] text-muted-foreground">Priority runs from top to bottom.</p>
          <div className="grid grid-cols-[3rem_5.5rem_minmax(0,1fr)] gap-2 px-1 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            <span>Qty</span>
            <span>Shape</span>
            <span>Size</span>
          </div>
          {holder.groups.map((group, index) => {
            const groupStandard = holderSizePreset(group)
            const customOpen = customHolderGroups.has(group.id) || !groupStandard
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
                  onChange={(quantity) => {
                    const groups = holder.groups.map((entry, groupIndex) =>
                      groupIndex === index ? { ...group, quantity: Math.round(quantity) } : entry,
                    )
                    setHolder({ ...holder, groups })
                  }}
                />
                <CompactChoice
                  label={`Shape ${index + 1}`}
                  value={group.shape}
                  options={SHAPES}
                  onChange={(shape) => {
                    hideCustomHolderGroup(group.id)
                    setHolder({
                      ...holder,
                      groups: holder.groups.map((entry, groupIndex) =>
                        groupIndex === index ? holderGroup(group.id, group.quantity, { shape }) : entry,
                      ),
                    })
                  }}
                />
                <SizeSelect
                  compact
                  label={`Standard base size ${index + 1}`}
                  value={customOpen ? CUSTOM_HOLDER_SIZE : (groupStandard?.label ?? CUSTOM_HOLDER_SIZE)}
                  options={[
                    ...SIZES_BY_SHAPE[group.shape].map((size) => ({ value: size.label, use: size.use })),
                    { value: CUSTOM_HOLDER_SIZE, label: 'Custom', use: 'exact dimensions' },
                  ]}
                  onChange={(value) => {
                    if (value === CUSTOM_HOLDER_SIZE) {
                      showCustomHolderGroup(group.id)
                      return
                    }
                    const size = SIZES_BY_SHAPE[group.shape].find((candidate) => candidate.label === value)
                    if (!size) return
                    hideCustomHolderGroup(group.id)
                    setHolder({
                      ...holder,
                      groups: holder.groups.map((entry, groupIndex) =>
                        groupIndex === index
                          ? holderGroup(group.id, group.quantity, {
                              shape: size.shape,
                              width: size.width,
                              length: size.length ?? size.width,
                            })
                          : entry,
                      ),
                    })
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
                      onChange={(baseWidth) =>
                        setHolder({
                          ...holder,
                          groups: holder.groups.map((entry, groupIndex) =>
                            groupIndex === index
                              ? { ...group, width: baseWidth, length: isElongated(group.shape) ? group.length : baseWidth }
                              : entry,
                          ),
                        })
                      }
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
                        onChange={(baseLength) =>
                          setHolder({
                            ...holder,
                            groups: holder.groups.map((entry, groupIndex) =>
                              groupIndex === index ? { ...group, length: baseLength } : entry,
                            ),
                          })
                        }
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
                      onClick={() => moveGroup(index, -1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Decrease priority of miniature group ${index + 1}`}
                      disabled={index === holder.groups.length - 1}
                      onClick={() => moveGroup(index, 1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove miniature group ${index + 1}`}
                      disabled={holder.groups.length === 1}
                      onClick={() => setHolder({ ...holder, groups: holder.groups.filter((_, groupIndex) => groupIndex !== index) })}
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
            onClick={() => setHolder({ ...holder, groups: [...holder.groups, holderGroup(crypto.randomUUID(), 1, { width: 40 })] })}
          >
            <Plus /> Add size
          </Button>
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
            label="Between minis"
            value={holder.spacing}
            min={0}
            max={10}
            step={0.5}
            defaultValue={HOLDER_DEFAULTS.spacing}
            onChange={(spacing) => setHolder({ ...holder, spacing })}
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
            label="Height"
            value={holder.height}
            min={7}
            max={42}
            step={7}
            defaultValue={HOLDER_DEFAULTS.height}
            onChange={(height) => setHolder(fitSlotDepth({ ...holder, height }))}
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
            label="Label base sizes"
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
              {trimNumber(holder.magnets.diameter + holder.magnets.clearance)} mm hole
            </span>
          }
        >
          <ToggleSetting
            label="Slot magnets"
            checked={holder.magnets.enabled}
            defaultChecked={HOLDER_DEFAULTS.magnets.enabled}
            onChange={(enabled) => setHolder(fitSlotDepth({ ...holder, magnets: { ...holder.magnets, enabled } }))}
          />
          <Dimension
            label="Magnet diameter"
            value={holder.magnets.diameter}
            min={2}
            max={8}
            step={0.5}
            defaultValue={BASE_DEFAULTS.magnets.diameter}
            disabled={!holder.magnets.enabled}
            onChange={(diameter) => setSharedMagnets({ diameter })}
          />
          <Dimension
            label="Magnet thickness"
            value={holder.magnets.thickness}
            min={0.5}
            max={maxSharedMagnetThickness}
            step={0.1}
            defaultValue={BASE_DEFAULTS.magnets.thickness}
            disabled={!holder.magnets.enabled}
            onChange={(thickness) => setSharedMagnets({ thickness })}
          />
          <Dimension
            label="Magnet fit clearance"
            value={holder.magnets.clearance}
            min={0}
            max={0.6}
            step={0.05}
            defaultValue={BASE_DEFAULTS.magnets.clearance}
            disabled={!holder.magnets.enabled}
            onChange={(clearance) => setSharedMagnets({ clearance })}
          />
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
  const panel = model === 'base' ? basePanel : holderPanel

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          {/* Same panel, same order; on a narrow screen it slides in from the left
              instead of standing beside the sheet. */}
          {!docked && (
            <Sheet>
              <SheetTrigger
                render={<Button size="icon-sm" variant="outline" aria-label={`${model === 'base' ? 'Base' : 'Holder'} settings`} />}
              >
                <PanelLeft />
              </SheetTrigger>
              <SheetContent side="left" className="w-80 max-w-[85vw] gap-0 p-0">
                {/* A header row of its own, so the close button has somewhere to sit
                    that is not on top of the first section heading. */}
                <SheetHeader className="shrink-0 border-b border-border px-5 py-3.5">
                  <SheetTitle className="note">{model === 'base' ? 'Base' : 'Holder'} settings</SheetTitle>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
              </SheetContent>
            </Sheet>
          )}
          <h1 className="shrink-0 py-3 text-sm font-medium tracking-[0.18em] uppercase">
            <span className="sm:hidden">MB</span>
            <span className="max-sm:hidden">
              Mini <span className="text-measure">Bases</span>
            </span>
          </h1>
          <nav aria-label="Generators" className="flex self-stretch">
            {MODELS.map((item) => (
              <a
                key={item.value}
                href={item.href}
                aria-current={model === item.value ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  changeModel(item.value)
                }}
                className="note relative flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-measure after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:scale-x-0 after:bg-measure after:transition-transform aria-[current=page]:after:scale-x-100"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <ButtonGroup>
          {/* The labels fold away on a phone; the icons and the names still read out. */}
          <Button size="sm" onClick={exportStl} disabled={!preview || exporting !== undefined}>
            <Download />
            <span className="max-sm:sr-only">
              {exporting === 'stl' ? 'Building STL' : model === 'holder' && plan.modules.length > 1 ? 'Download STLs' : 'Download STL'}
            </span>
          </Button>
          <Button size="sm" variant="outline" onClick={export3mf} disabled={!preview || exporting !== undefined}>
            <Box />
            <span className="max-sm:sr-only">{exporting === '3mf' ? 'Building 3MF' : 'Download 3MF'}</span>
          </Button>
        </ButtonGroup>
      </header>

      <div className="flex min-h-0 flex-1">
        {docked && panel}

        <main className="relative min-w-0 flex-1">
          <Viewer mesh={preview} width={partWidth} length={partLength} height={partHeight} round={model === 'base' && !elongated} />
          {(error || exportError) && (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 border-b border-destructive/50 bg-destructive/10 px-5 py-2 text-xs text-destructive"
            >
              {error ? `${error}. Showing the last model that built.` : `Export failed: ${exportError}`}
            </div>
          )}
          <TitleBlock config={partConfig} status={error ? 'blocked' : 'ready'} name={partName} />
        </main>
      </div>
    </div>
  )
}
