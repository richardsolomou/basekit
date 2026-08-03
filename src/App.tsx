import { Box, ChevronDown, ChevronUp, Code2, Download, PanelLeft, Plus, Share2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { zipSync } from 'fflate'
import { Choice, Dimension, Fold, Section, SizeSelect } from '@/components/controls'
import { Accordion } from '@/components/ui/accordion'
import { Button, buttonVariants } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import { to3mf, toStl } from '@/geometry/exporters'
import { defaultHolderConfig, holderLayout, holderName, holderPlan } from '@/geometry/holder'
import { baseName, defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import {
  DEFAULT_PRESET,
  DEFAULT_SIZE,
  MAGNET_CHOICES,
  presetFor,
  resized,
  RIB_CHOICES,
  SIZES_BY_SHAPE,
  type SizePreset,
} from '@/geometry/presets'
import { maxProfileSize } from '@/geometry/profile'
import { exportSegmentsFor } from '@/geometry/quality'
import type { BaseConfig, EdgeProfile, HolderConfig, ShapeKind, Underside } from '@/geometry/types'
import { buildMesh } from '@/lib/buildMesh'
import { asMeshLike, download } from '@/lib/download'
import { useGenerator } from '@/lib/useGenerator'
import { useMediaQuery } from '@/lib/useMediaQuery'
import posthog from '@/lib/posthog'
import { shareUrl, sharedConfigFromUrl } from '@/lib/shareConfig'

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rect' },
  { value: 'polygon', label: 'Hex' },
]

const PROFILES: { value: EdgeProfile; label: string }[] = [
  { value: 'taper', label: 'Taper' },
  { value: 'bevel', label: 'Bevel' },
  { value: 'round', label: 'Round' },
  { value: 'straight', label: 'Straight' },
]

const UNDERSIDES: { value: Underside; label: string }[] = [
  { value: 'well', label: 'Hollow well' },
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

const modelForPath = (): 'base' | 'holder' => (window.location.pathname === '/holders' ? 'holder' : 'base')

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
  const [shared] = useState(() => sharedConfigFromUrl(window.location.href))
  const [config, setConfig] = useState<BaseConfig>(() => (shared?.model === 'base' ? shared.config : presetFor(DEFAULT_PRESET)))
  const [holder, setHolder] = useState<HolderConfig>(() => (shared?.model === 'holder' ? shared.config : defaultHolderConfig()))
  const [model, setModel] = useState<'base' | 'holder'>(modelForPath)
  const [exporting, setExporting] = useState<'stl' | '3mf'>()
  const [exportError, setExportError] = useState<string>()
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // Tailwind's `md`, the width at which the panel stops needing to slide in.
  const docked = useMediaQuery('(min-width: 48rem)')
  const partConfig = model === 'base' ? config : holder
  const { preview, error } = useGenerator(partConfig)

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
    window.history.pushState(null, '', next === 'holder' ? '/holders' : '/')
    setModel(next)
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(partConfig))
      posthog.capture('configuration_shared', { model })
      setShareState('copied')
      window.setTimeout(() => setShareState('idle'), 2000)
    } catch {
      setShareState('failed')
    }
  }

  const safeEdgeSize = (next: BaseConfig) => Math.floor((maxProfileSize(next) + 1e-6) * 10) / 10
  const patch = (changes: Partial<BaseConfig>) =>
    setConfig((current) => {
      const next = { ...current, ...changes }
      return { ...next, profileSize: Math.min(next.profileSize, safeEdgeSize(next)) }
    })
  const { width, length } = footprint(config)
  const holderSize = holderLayout(holder)
  const plan = holderPlan(holder)
  const requestedModels = holder.groups.reduce((total, group) => total + group.quantity, 0)
  const fittedByGroup = new Map<string, number>()
  for (const module of plan.modules) {
    for (const group of module.config.groups) fittedByGroup.set(group.id, (fittedByGroup.get(group.id) ?? 0) + group.quantity)
  }
  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= holder.groups.length) return
    const groups = [...holder.groups]
    const current = groups[index]
    groups[index] = groups[target]
    groups[target] = current
    setHolder({ ...holder, groups })
  }
  const partWidth = model === 'base' ? width : holderSize.width
  const partLength = model === 'base' ? length : holderSize.length
  const partHeight = model === 'base' ? config.height : holder.height
  const partName = model === 'base' ? baseName(config) : holderName(holder)
  const elongated = isElongated(config.shape)
  const hollow = config.underside === 'well'
  const sizes = SIZES_BY_SHAPE[config.shape]
  const standard = sizes.find((size) => size.width === width && (size.length ?? size.width) === length)

  const loadPreset = (size: SizePreset) => {
    posthog.capture('base_size_selected', { size: size.label, shape: config.shape })
    setConfig(presetFor(size))
  }

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    posthog.capture('base_shape_selected', { shape })
    const target = DEFAULT_SIZE[shape]
    setConfig(resized({ ...config, shape }, target.width, target.length ?? target.width))
  }

  const buildExport = async (format: 'stl' | '3mf') => {
    setExporting(format)
    setExportError(undefined)
    try {
      return await buildMesh({ ...partConfig, segments: exportSegmentsFor(Math.max(partWidth, partLength)) })
    } catch (failure) {
      posthog.captureException(failure, { export_format: format })
      setExportError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setExporting(undefined)
    }
  }

  const exportStl = async () => {
    if (model === 'holder' && plan.modules.length > 1) {
      setExporting('stl')
      setExportError(undefined)
      try {
        const meshes = await Promise.all(
          plan.modules.map((module) =>
            buildMesh({ ...module.config, segments: exportSegmentsFor(Math.max(module.layout.width, module.layout.length)) }),
          ),
        )
        const files = Object.fromEntries(
          meshes.map((mesh, index) => {
            const name = `module-${index + 1}-${holderName(plan.modules[index].config)}.stl`
            return [name, toStl(asMeshLike(mesh), name)]
          }),
        )
        download(`${partName}.zip`, zipSync(files))
      } catch (failure) {
        setExportError(failure instanceof Error ? failure.message : String(failure))
      } finally {
        setExporting(undefined)
      }
      return
    }
    const mesh = await buildExport('stl')
    if (!mesh) return
    const name = `${partName}.stl`
    download(name, toStl(asMeshLike(mesh), name))
    posthog.capture('base_exported', { format: 'stl', shape: config.shape, width, length, height: config.height })
  }

  const export3mf = async () => {
    const mesh = await buildExport('3mf')
    if (!mesh) return
    const name = partName
    download(`${name}.3mf`, to3mf([{ mesh: asMeshLike(mesh), name }]))
    posthog.capture('base_exported', { format: '3mf', shape: config.shape, width, length, height: config.height })
  }

  const basePanel = (
    <ScrollArea className="h-full w-80 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      {/* Sections number themselves off this counter, in the order they appear. */}
      <aside aria-label="Base settings" className="pb-4 [counter-reset:schedule]">
        <Section title="Footprint">
          <SizeSelect
            value={standard?.label ?? null}
            options={sizes.map((size) => ({ value: size.label, use: size.use }))}
            onChange={(label) => {
              const size = sizes.find((s) => s.label === label)
              if (size) loadPreset(size)
            }}
          />
          <Choice label="Base shape" hideLabel value={config.shape} options={SHAPES} onChange={changeShape} />
          <Dimension
            label={elongated ? 'Width' : config.shape === 'round' ? 'Diameter' : 'Across'}
            value={config.width}
            min={15}
            max={180}
            step={0.5}
            onChange={(w) => setConfig(resized(config, w, config.length))}
          />
          {elongated && (
            <Dimension
              label="Depth"
              value={config.length}
              min={15}
              max={180}
              step={0.5}
              onChange={(l) => setConfig(resized(config, config.width, l))}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              Ø{trimNumber(config.magnets.diameter + config.magnets.clearance)} pocket
            </span>
          }
        >
          <Dimension
            label="Magnet Ø"
            value={config.magnets.diameter}
            min={2}
            max={12}
            step={0.5}
            disabled={config.magnets.count === 0}
            onChange={(diameter) => patch({ magnets: { ...config.magnets, diameter } })}
          />
          <Dimension
            label="Magnet thickness"
            value={config.magnets.thickness}
            min={0.5}
            // A well seats the magnet on its floor, so it can be no thicker than the
            // well is deep or it would stand proud of the top face.
            max={hollow ? Math.max(0.5, config.height - config.floorThickness) : Math.max(1, config.height - 0.4)}
            step={0.5}
            disabled={config.magnets.count === 0}
            onChange={(thickness) => patch({ magnets: { ...config.magnets, thickness } })}
          />
        </Section>

        <Section title="Marking">
          <Field orientation="horizontal">
            <FieldLabel htmlFor="marking-enabled" className="font-normal">
              Emboss the size inside
            </FieldLabel>
            <Switch
              id="marking-enabled"
              aria-label="Emboss the size inside"
              checked={config.label.enabled}
              onCheckedChange={(enabled) => {
                posthog.capture('base_marking_toggled', { enabled })
                patch({ label: { ...config.label, enabled } })
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="marking-text" className="sr-only">
              Marking text
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

        {/* Folds are independent: opening the profile should not shut the tolerances. */}
        <Accordion multiple className="border-b border-border">
          <Fold title="Construction" summary={`${trimNumber(config.height)}mm · ${config.profile}`}>
            <Choice label="Underside" value={config.underside} options={UNDERSIDES} onChange={(underside) => patch({ underside })} />
            <div aria-hidden="true" className="grid grid-cols-2 gap-2 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
              <div className={`border p-2 ${hollow ? 'border-measure/60 text-measure' : 'border-border'}`}>
                <div className="mx-auto mb-1 h-3 w-12 border-x border-b border-current" />
                Recessed
              </div>
              <div className={`border p-2 ${hollow ? 'border-border' : 'border-measure/60 text-measure'}`}>
                <div className="mx-auto mb-1 h-3 w-12 border border-current bg-current/10" />
                Filled
              </div>
            </div>
            <Dimension label="Height" value={config.height} min={2} max={12} step={0.25} onChange={(height) => patch({ height })} />
            <Dimension
              label="Wall"
              value={config.wallThickness}
              min={1}
              max={6}
              step={0.1}
              onChange={(wallThickness) => patch({ wallThickness })}
            />
            {/* Only a hollowed underside has a floor to set. It is the face the model
                is glued to, and it is never between a magnet and the tray. */}
            {hollow && (
              <Dimension
                label="Recess floor"
                value={config.floorThickness}
                min={0.4}
                max={Math.max(0.5, config.height - 0.5)}
                step={0.1}
                onChange={(floorThickness) => patch({ floorThickness })}
              />
            )}
            <Choice label="Bottom edge" value={config.profile} options={PROFILES} onChange={(profile) => patch({ profile })} />
            <Dimension
              label="Edge size"
              value={config.profileSize}
              min={0}
              max={safeEdgeSize(config)}
              step={0.1}
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
                onChange={(cornerRadius) => patch({ cornerRadius })}
              />
            )}
            {config.shape === 'polygon' && (
              <Dimension label="Sides" value={config.sides} min={3} max={12} step={1} unit="" onChange={(sides) => patch({ sides })} />
            )}
          </Fold>

          <Fold
            title="Magnet layout"
            summary={config.magnets.count === 0 ? 'none' : `${config.magnets.count} ${config.magnets.count === 1 ? 'pocket' : 'pockets'}`}
          >
            <Choice
              label="Magnets per base"
              hideLabel
              value={config.magnets.count}
              options={MAGNET_COUNTS}
              onChange={(count) => patch({ magnets: { ...config.magnets, count } })}
            />
          </Fold>

          <Fold title="Bracing" summary={config.ribs.count === 0 ? 'none' : `${config.ribs.count} spokes`}>
            <Choice
              label="Spokes"
              hideLabel
              value={config.ribs.count}
              options={RIB_COUNTS}
              onChange={(count) => patch({ ribs: { ...config.ribs, count } })}
            />
            <Dimension
              label="Thickness"
              value={config.ribs.thickness}
              min={0.8}
              max={4}
              step={0.1}
              disabled={config.ribs.count === 0}
              onChange={(thickness) => patch({ ribs: { ...config.ribs, thickness } })}
            />
            <Dimension
              label="Height"
              value={config.ribs.height}
              min={0.4}
              max={Math.max(0.5, config.height - config.floorThickness)}
              step={0.1}
              disabled={config.ribs.count === 0}
              onChange={(height) => patch({ ribs: { ...config.ribs, height } })}
            />
          </Fold>

          <Fold title="Tolerances" summary={`Ø${trimNumber(config.magnets.clearance)} fit`}>
            <Dimension
              label="Magnet fit clearance"
              value={config.magnets.clearance}
              min={0}
              max={0.6}
              step={0.05}
              onChange={(clearance) => patch({ magnets: { ...config.magnets, clearance } })}
            />
            <Dimension
              label="Wall around pocket"
              value={config.magnets.bossWall}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(bossWall) => patch({ magnets: { ...config.magnets, bossWall } })}
            />
            <Dimension
              label="Marking height"
              value={config.label.height}
              min={2}
              max={16}
              step={0.5}
              disabled={!config.label.enabled}
              onChange={(height) => patch({ label: { ...config.label, height } })}
            />
            <Dimension
              label="Marking emboss"
              value={config.label.emboss}
              min={0.2}
              max={1.5}
              step={0.1}
              disabled={!config.label.enabled}
              onChange={(emboss) => patch({ label: { ...config.label, emboss } })}
            />
          </Fold>
        </Accordion>
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
          <div className="grid grid-cols-[3rem_4rem_1fr_4.75rem] gap-2 px-1 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            <span>Fit</span>
            <span>Qty</span>
            <span>Base Ø</span>
          </div>
          {holder.groups.map((group, index) => (
            <div
              key={group.id}
              className="grid grid-cols-[3rem_4rem_1fr_4.75rem] items-center gap-2 border-b border-border pb-2 last:border-0"
            >
              <span
                className={`readout text-xs ${(fittedByGroup.get(group.id) ?? 0) < group.quantity ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {fittedByGroup.get(group.id) ?? 0}/{group.quantity}
              </span>
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
              <Dimension
                label={`Base Ø ${index + 1}`}
                value={group.diameter}
                min={15}
                max={180}
                step={0.5}
                compact
                onChange={(diameter) =>
                  setHolder({
                    ...holder,
                    groups: holder.groups.map((entry, groupIndex) => (groupIndex === index ? { ...group, diameter } : entry)),
                  })
                }
              />
              <div className="flex">
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
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setHolder({ ...holder, groups: [...holder.groups, { id: crypto.randomUUID(), quantity: 1, diameter: 40 }] })}
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
            onChange={(maxColumns) => setHolder({ ...holder, maxColumns: Math.round(maxColumns) })}
          />
          <Dimension
            label="Maximum rows"
            value={holder.maxRows}
            min={1}
            max={12}
            step={1}
            unit=""
            onChange={(maxRows) => setHolder({ ...holder, maxRows: Math.round(maxRows) })}
          />
          <Dimension
            label="Between minis"
            value={holder.spacing}
            min={0}
            max={10}
            step={0.5}
            onChange={(spacing) => setHolder({ ...holder, spacing })}
          />
          <Field orientation="horizontal">
            <FieldLabel htmlFor="split-holder-groups" className="font-normal">
              Split into modules
            </FieldLabel>
            <Switch
              id="split-holder-groups"
              checked={holder.splitGroups}
              onCheckedChange={(splitGroups) => setHolder({ ...holder, splitGroups })}
            />
          </Field>
          <div className="space-y-1 border-y border-border py-3 text-xs">
            {plan.modules.map((module, index) => (
              <div key={`${module.config.groups[0].id}-${module.column}-${module.row}`} className="flex justify-between gap-3">
                <span className="text-muted-foreground">Module {index + 1}</span>
                <span className="readout">
                  {module.config.groups.map((group) => `${group.quantity}×Ø${trimNumber(group.diameter)}`).join(' + ')} ·{' '}
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
            onChange={(height) => setHolder({ ...holder, height })}
          />
        </Section>

        <Section title="Slots" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(holder.slotDepth)}mm deep</span>}>
          <Dimension
            label="Slot depth"
            value={holder.slotDepth}
            min={1}
            max={Math.max(1, holder.height - (holder.magnets.enabled ? holder.magnets.thickness : 0) - 0.4)}
            step={0.5}
            onChange={(slotDepth) => setHolder({ ...holder, slotDepth })}
          />
          <Dimension
            label="Slot clearance"
            value={holder.slotClearance}
            min={0.1}
            max={2}
            step={0.1}
            onChange={(slotClearance) => setHolder({ ...holder, slotClearance })}
          />
          <Field orientation="horizontal">
            <FieldLabel htmlFor="holder-engraving" className="font-normal">
              Engrave base sizes
            </FieldLabel>
            <Switch
              id="holder-engraving"
              checked={holder.engraving.enabled}
              onCheckedChange={(enabled) => setHolder({ ...holder, engraving: { ...holder.engraving, enabled } })}
            />
          </Field>
          {holder.engraving.enabled && (
            <Choice
              label="Engraving location"
              value={holder.engraving.placement}
              options={ENGRAVING_PLACEMENTS}
              onChange={(placement) => setHolder({ ...holder, engraving: { ...holder.engraving, placement } })}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              Ø{trimNumber(holder.magnets.diameter + holder.magnets.clearance)} pocket
            </span>
          }
        >
          <Field orientation="horizontal">
            <FieldLabel htmlFor="holder-magnets" className="font-normal">
              Slot magnets
            </FieldLabel>
            <Switch
              id="holder-magnets"
              checked={holder.magnets.enabled}
              onCheckedChange={(enabled) => setHolder({ ...holder, magnets: { ...holder.magnets, enabled } })}
            />
          </Field>
          <Dimension
            label="Magnet Ø"
            value={holder.magnets.diameter}
            min={2}
            max={8}
            step={0.5}
            disabled={!holder.magnets.enabled}
            onChange={(diameter) => setHolder({ ...holder, magnets: { ...holder.magnets, diameter } })}
          />
          <Dimension
            label="Magnet thickness"
            value={holder.magnets.thickness}
            min={0.5}
            max={Math.max(0.5, holder.height - holder.slotDepth - 0.4)}
            step={0.1}
            disabled={!holder.magnets.enabled}
            onChange={(thickness) => setHolder({ ...holder, magnets: { ...holder.magnets, thickness } })}
          />
          <Dimension
            label="Magnet fit clearance"
            value={holder.magnets.clearance}
            min={0}
            max={1}
            step={0.05}
            disabled={!holder.magnets.enabled}
            onChange={(clearance) => setHolder({ ...holder, magnets: { ...holder.magnets, clearance } })}
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
          <Button
            size="sm"
            variant="outline"
            onClick={copyShareLink}
            aria-label={
              shareState === 'copied' ? 'Copied share link' : shareState === 'failed' ? 'Could not copy share link' : 'Copy share link'
            }
          >
            <Share2 />
            <span className="max-sm:sr-only">{shareState === 'copied' ? 'Copied' : shareState === 'failed' ? 'Copy failed' : 'Share'}</span>
          </Button>
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
