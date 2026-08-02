import { Box, Download, Package } from 'lucide-react'
import { useState } from 'react'
import { Choice, Drawer, Field, gridColumns, Section } from '@/components/controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TitleBlock } from '@/components/TitleBlock'
import { Viewer } from '@/components/Viewer'
import { to3mf, toStl, toZip } from '@/geometry/exporters'
import { baseName, defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import { DEFAULT_PRESET, DEFAULT_SIZE, presetFor, resized, segmentsFor, SIZES_BY_SHAPE, type SizePreset } from '@/geometry/presets'
import type { BaseConfig, EdgeProfile, ShapeKind, Underside } from '@/geometry/types'
import { asMeshLike, download } from '@/lib/download'
import { cn } from '@/lib/utils'
import { useGenerator } from '@/lib/useGenerator'

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

const MAGNET_COUNTS = [0, 1, 2, 3, 4, 6].map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
const RIB_COUNTS = [0, 2, 3, 4, 6].map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
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
  const [packLabels, setPackLabels] = useState<string[]>(['25', '32', '40'])
  const [packing, setPacking] = useState(false)
  const { preview, error, busy, buildPack } = useGenerator(config)

  const patch = (changes: Partial<BaseConfig>) => setConfig((current) => ({ ...current, ...changes }))
  const stats = preview?.stats
  const { width, length } = footprint(config)
  const elongated = isElongated(config.shape)
  const hollow = config.underside === 'well'
  const sizes = SIZES_BY_SHAPE[config.shape]
  const selectedPack = sizes.filter((s) => packLabels.includes(s.label))
  const markingText = config.label.text?.trim() || defaultLabel(config)

  const loadPreset = (size: SizePreset) => {
    setConfig(presetFor(size))
    // A different family has different labels, so start its pack from the loaded size.
    setPackLabels((current) => (sizes.some((s) => s.label === size.label) ? current : [size.label]))
  }

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    const target = DEFAULT_SIZE[shape]
    setConfig(resized({ ...config, shape }, target.width, target.length ?? target.width))
    setPackLabels([target.label])
  }

  const exportStl = () => {
    if (!preview) return
    const name = `${baseName(config)}.stl`
    download(name, toStl(asMeshLike(preview.mesh), name))
  }

  const export3mf = () => {
    if (!preview) return
    const name = baseName(config)
    download(`${name}.3mf`, to3mf([{ mesh: asMeshLike(preview.mesh), name }]))
  }

  const exportPack = async () => {
    if (selectedPack.length === 0) return
    setPacking(true)
    try {
      // Every size in the pack keeps the current settings, so a pack stays consistent.
      const parts = await buildPack(
        selectedPack.map((size) => ({
          ...config,
          shape: size.shape,
          width: size.width,
          length: size.length ?? size.width,
          segments: segmentsFor(Math.max(size.width, size.length ?? size.width)),
          label: { ...config.label, text: undefined },
        })),
      )
      const files: Record<string, Uint8Array> = {}
      for (const part of parts) files[`${part.name}.stl`] = toStl(asMeshLike(part.mesh), part.name)
      download(`bases-${selectedPack.length}-pack.zip`, toZip(files))
    } finally {
      setPacking(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-medium tracking-[0.18em] uppercase">BaseSmith</h1>
          <p className="readout hidden text-xs text-muted-foreground sm:block">tabletop bases · magnets · embossed size</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={exportStl} disabled={!preview}>
            <Download />
            Save STL
          </Button>
          <Button size="sm" variant="outline" onClick={export3mf} disabled={!preview}>
            <Box />
            Save 3MF
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-border bg-card/40">
          <Section title="Footprint">
            <Choice value={config.shape} options={SHAPES} onChange={changeShape} />
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={1}
              value={[`${width}x${length}`]}
              onValueChange={(next: string[]) => {
                const picked = sizes.find((s) => `${s.width}x${s.length ?? s.width}` === next[0])
                if (picked) loadPreset(picked)
              }}
              className={cn('grid w-full', gridColumns(sizes.length))}
            >
              {sizes.map((size) => (
                <ToggleGroupItem
                  key={size.label}
                  value={`${size.width}x${size.length ?? size.width}`}
                  title={size.use}
                  className="readout min-w-0 text-xs"
                >
                  {size.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Field
              label={elongated ? 'Width' : 'Across'}
              value={config.width}
              min={15}
              max={180}
              step={0.5}
              onChange={(w) => setConfig(resized(config, w, config.length))}
            />
            {elongated && (
              <Field
                label="Depth"
                value={config.length}
                min={15}
                max={180}
                step={0.5}
                onChange={(l) => setConfig(resized(config, config.width, l))}
              />
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              A preset loads sensible magnets and ribs for that size. Hover a size to see what it is for.
            </p>
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
              value={config.magnets.count}
              options={MAGNET_COUNTS}
              onChange={(count) => patch({ magnets: { ...config.magnets, count } })}
            />
            <Field
              label="Magnet Ø"
              value={config.magnets.diameter}
              min={2}
              max={12}
              step={0.5}
              disabled={config.magnets.count === 0}
              onChange={(diameter) => patch({ magnets: { ...config.magnets, diameter } })}
            />
          </Section>

          <Section title="Marking">
            <div className="flex items-center justify-between">
              <Label htmlFor="marking" className="text-sm font-normal text-foreground/85">
                Emboss the size inside
              </Label>
              <Switch
                id="marking"
                aria-label="Emboss the size inside"
                checked={config.label.enabled}
                onCheckedChange={(enabled) => patch({ label: { ...config.label, enabled } })}
              />
            </div>
            <Input
              aria-label="Marking text"
              value={config.label.text ?? ''}
              placeholder={defaultLabel(config)}
              disabled={!config.label.enabled || !hollow}
              onChange={(e) => patch({ label: { ...config.label, text: e.currentTarget.value } })}
              className="readout"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {hollow
                ? `“${markingText}” sits on the well floor — hidden once based, obvious in the slicer.`
                : 'A solid base has no well to emboss. Switch the underside back to a well under Profile.'}
            </p>
          </Section>

          <Drawer title="Profile" summary={`${trimNumber(config.height)}mm · ${config.profile}`}>
            <Choice label="Underside" value={config.underside} options={UNDERSIDES} onChange={(underside) => patch({ underside })} />
            <Field label="Height" value={config.height} min={2} max={12} step={0.25} onChange={(height) => patch({ height })} />
            <Field
              label="Wall"
              value={config.wallThickness}
              min={1}
              max={6}
              step={0.1}
              onChange={(wallThickness) => patch({ wallThickness })}
            />
            <Field
              label={hollow ? 'Floor under magnet' : 'Pocket depth'}
              value={hollow ? config.floorThickness : config.magnets.depth}
              min={hollow ? 0.4 : 1}
              max={hollow ? Math.max(0.5, config.height - 0.5) : Math.max(1.5, config.height - 0.5)}
              step={0.1}
              onChange={(v) => (hollow ? patch({ floorThickness: v }) : patch({ magnets: { ...config.magnets, depth: v } }))}
            />
            <Choice label="Bottom edge" value={config.profile} options={PROFILES} onChange={(profile) => patch({ profile })} />
            <Field
              label="Edge size"
              value={config.profileSize}
              min={0}
              max={3}
              step={0.1}
              disabled={config.profile === 'straight'}
              onChange={(profileSize) => patch({ profileSize })}
            />
            {config.shape === 'rect' && (
              <Field
                label="Corner radius"
                value={config.cornerRadius}
                min={0}
                max={12}
                step={0.5}
                onChange={(cornerRadius) => patch({ cornerRadius })}
              />
            )}
            {config.shape === 'polygon' && (
              <Field label="Sides" value={config.sides} min={3} max={12} step={1} unit="" onChange={(sides) => patch({ sides })} />
            )}
          </Drawer>

          <Drawer title="Bracing" summary={config.ribs.count === 0 ? 'none' : `${config.ribs.count} spokes`}>
            <Choice value={config.ribs.count} options={RIB_COUNTS} onChange={(count) => patch({ ribs: { ...config.ribs, count } })} />
            <Field
              label="Thickness"
              value={config.ribs.thickness}
              min={0.8}
              max={4}
              step={0.1}
              disabled={config.ribs.count === 0}
              onChange={(thickness) => patch({ ribs: { ...config.ribs, thickness } })}
            />
            <Field
              label="Height"
              value={config.ribs.height}
              min={0.4}
              max={Math.max(0.5, config.height - config.floorThickness)}
              step={0.1}
              disabled={config.ribs.count === 0}
              onChange={(height) => patch({ ribs: { ...config.ribs, height } })}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Spokes brace the floor and give basing material something to key into.
            </p>
          </Drawer>

          <Drawer title="Tolerances" summary={`Ø${trimNumber(config.magnets.clearance)} fit`}>
            <Field
              label="Magnet fit clearance"
              value={config.magnets.clearance}
              min={0}
              max={0.6}
              step={0.05}
              onChange={(clearance) => patch({ magnets: { ...config.magnets, clearance } })}
            />
            <Field
              label="Wall around pocket"
              value={config.magnets.bossWall}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(bossWall) => patch({ magnets: { ...config.magnets, bossWall } })}
            />
            <Field
              label="Marking height"
              value={config.label.height}
              min={2}
              max={16}
              step={0.5}
              disabled={!config.label.enabled}
              onChange={(height) => patch({ label: { ...config.label, height } })}
            />
            <Field
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
          </Drawer>

          <Drawer title="Pack" summary={`${selectedPack.length} sizes`}>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={1}
              multiple
              value={packLabels}
              onValueChange={(next: string[]) => setPackLabels(next)}
              className={cn('grid w-full', gridColumns(sizes.length))}
            >
              {sizes.map((size) => (
                <ToggleGroupItem key={size.label} value={size.label} className="readout min-w-0 text-xs">
                  {size.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every size gets the settings above, with its own number embossed.
            </p>
            <Button variant="outline" className="w-full" onClick={exportPack} disabled={packing || selectedPack.length === 0}>
              <Package />
              {packing ? 'Building pack…' : `Save ${selectedPack.length} STLs as zip`}
            </Button>
          </Drawer>
        </aside>

        <main className="relative min-w-0 flex-1">
          <Viewer mesh={preview?.mesh} width={width} length={length} height={config.height} round={!elongated} />
          {error && (
            <div
              role="alert"
              className="absolute inset-x-0 top-0 border-b border-destructive/50 bg-destructive/10 px-5 py-2 text-xs text-destructive"
            >
              {error}. Showing the last base that built.
            </div>
          )}
          <TitleBlock config={config} stats={stats} status={error ? 'blocked' : busy ? 'solving' : 'ready'} name={baseName(config)} />
        </main>
      </div>
    </div>
  )
}
