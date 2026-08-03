import { Box, Download, PanelLeft } from 'lucide-react'
import { useState } from 'react'
import { Choice, Dimension, Fold, Section, SizeSelect } from '@/components/controls'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import { to3mf, toStl } from '@/geometry/exporters'
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
import type { BaseConfig, EdgeProfile, ShapeKind, Underside } from '@/geometry/types'
import { asMeshLike, download } from '@/lib/download'
import { useGenerator } from '@/lib/useGenerator'
import { useMediaQuery } from '@/lib/useMediaQuery'

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
  { value: 'well', label: 'Well' },
  { value: 'solid', label: 'Solid' },
]

const counts = (values: number[]) => values.map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
const MAGNET_COUNTS = counts(MAGNET_CHOICES)
const RIB_COUNTS = counts(RIB_CHOICES)
const QUALITY_STEPS = [96, 160, 256]

/**
 * How far a flat segment departs from the true curve, in microns. Naming the tiers
 * by the error they actually produce beats vague adjectives — and the number moves
 * with the base, because the same segment count is coarser on a bigger circle.
 */
function chordError(width: number, segments: number): number {
  return (width / 2) * (1 - Math.cos(Math.PI / segments)) * 1000
}

export function App() {
  const [config, setConfig] = useState<BaseConfig>(presetFor(DEFAULT_PRESET))
  // Tailwind's `md`, the width at which the panel stops needing to slide in.
  const docked = useMediaQuery('(min-width: 48rem)')
  const { preview, error } = useGenerator(config)

  const safeEdgeSize = (next: BaseConfig) => Math.floor((maxProfileSize(next) + 1e-6) * 10) / 10
  const patch = (changes: Partial<BaseConfig>) =>
    setConfig((current) => {
      const next = { ...current, ...changes }
      return { ...next, profileSize: Math.min(next.profileSize, safeEdgeSize(next)) }
    })
  const { width, length } = footprint(config)
  const elongated = isElongated(config.shape)
  const hollow = config.underside === 'well'
  const sizes = SIZES_BY_SHAPE[config.shape]
  const standard = sizes.find((size) => size.width === width && (size.length ?? size.width) === length)

  const loadPreset = (size: SizePreset) => setConfig(presetFor(size))

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    const target = DEFAULT_SIZE[shape]
    setConfig(resized({ ...config, shape }, target.width, target.length ?? target.width))
  }

  const exportStl = () => {
    if (!preview) return
    const name = `${baseName(config)}.stl`
    download(name, toStl(asMeshLike(preview), name))
  }

  const export3mf = () => {
    if (!preview) return
    const name = baseName(config)
    download(`${name}.3mf`, to3mf([{ mesh: asMeshLike(preview), name }]))
  }

  const panel = (
    <ScrollArea className="h-full w-80 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      {/* Sections number themselves off this counter, in the order they appear. */}
      <aside aria-label="Base settings" className="pb-4 [counter-reset:schedule]">
        <Section title="Footprint">
          <Choice label="Base shape" hideLabel value={config.shape} options={SHAPES} onChange={changeShape} />
          <SizeSelect
            value={standard?.label ?? null}
            options={sizes.map((size) => ({ value: size.label, use: size.use }))}
            onChange={(label) => {
              const size = sizes.find((s) => s.label === label)
              if (size) loadPreset(size)
            }}
          />
          <Dimension
            label={elongated ? 'Width' : 'Across'}
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
          <Choice
            label="Magnets per base"
            hideLabel
            value={config.magnets.count}
            options={MAGNET_COUNTS}
            onChange={(count) => patch({ magnets: { ...config.magnets, count } })}
          />
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
              onCheckedChange={(enabled) => patch({ label: { ...config.label, enabled } })}
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
            {!hollow && <FieldDescription>A solid base has no well to emboss. Switch the underside back under Profile.</FieldDescription>}
          </Field>
        </Section>

        {/* Folds are independent: opening the profile should not shut the tolerances. */}
        <Accordion multiple className="border-b border-border">
          <Fold title="Profile" summary={`${trimNumber(config.height)}mm · ${config.profile}`}>
            <Choice label="Underside" value={config.underside} options={UNDERSIDES} onChange={(underside) => patch({ underside })} />
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
            <Choice
              label="Curve tolerance"
              value={QUALITY_STEPS.reduce(
                (best, q) => (Math.abs(q - config.segments) < Math.abs(best - config.segments) ? q : best),
                QUALITY_STEPS[1],
              )}
              options={QUALITY_STEPS.map((segments) => ({
                value: segments,
                label: `${Math.max(1, Math.round(chordError(Math.max(width, length), segments)))}µm`,
              }))}
              onChange={(segments) => patch({ segments })}
            />
          </Fold>
        </Accordion>
      </aside>
    </ScrollArea>
  )

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          {/* Same panel, same order; on a narrow screen it slides in from the left
              instead of standing beside the sheet. */}
          {!docked && (
            <Sheet>
              <SheetTrigger render={<Button size="icon-sm" variant="outline" aria-label="Base settings" />}>
                <PanelLeft />
              </SheetTrigger>
              <SheetContent side="left" className="w-80 max-w-[85vw] gap-0 p-0">
                {/* A header row of its own, so the close button has somewhere to sit
                    that is not on top of the first section heading. */}
                <SheetHeader className="shrink-0 border-b border-border px-5 py-3.5">
                  <SheetTitle className="note">Base settings</SheetTitle>
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
              </SheetContent>
            </Sheet>
          )}
          <h1 className="text-sm font-medium tracking-[0.18em] uppercase">
            Mini <span className="text-measure">Bases</span>
          </h1>
        </div>
        <ButtonGroup>
          {/* The labels fold away on a phone; the icons and the names still read out. */}
          <Button size="sm" onClick={exportStl} disabled={!preview}>
            <Download />
            <span className="max-sm:sr-only">Save STL</span>
          </Button>
          <Button size="sm" variant="outline" onClick={export3mf} disabled={!preview}>
            <Box />
            <span className="max-sm:sr-only">Save 3MF</span>
          </Button>
        </ButtonGroup>
      </header>

      <div className="flex min-h-0 flex-1">
        {docked && panel}

        <main className="relative min-w-0 flex-1">
          <Viewer mesh={preview} width={width} length={length} height={config.height} round={!elongated} />
          {error && (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 border-b border-destructive/50 bg-destructive/10 px-5 py-2 text-xs text-destructive"
            >
              {error}. Showing the last base that built.
            </div>
          )}
          <TitleBlock config={config} status={error ? 'blocked' : 'ready'} name={baseName(config)} />
        </main>
      </div>
    </div>
  )
}
