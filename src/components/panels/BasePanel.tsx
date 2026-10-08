import { Choice, Dimension, Section, SizeSelect, ToggleSetting } from '@/components/controls'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { supportsFivePocketCross } from '@/geometry/base'
import { defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import {
  defaultBaseHeight,
  defaultFloorThickness,
  DEFAULT_SIZE,
  MAGNET_CHOICES,
  presetFor,
  resized,
  RIB_CHOICES,
  SIZES_BY_SHAPE,
  type SizePreset,
} from '@/geometry/presets'
import type { BaseConfig, ShapeKind } from '@/geometry/types'
import posthog from '@/lib/posthog'
import {
  AUTOMATIC_MAGNET_COUNT,
  BASE_DEFAULTS,
  MAGNET_LAYOUTS,
  PROFILES,
  PanelFooter,
  safeEdgeSize,
  type MagnetCountChoice,
  type ResetAction,
  type SharedMagnetChanges,
  type SharedMagnetPlacementChanges,
} from './shared'

const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'polygon', label: 'Hex' },
]

const CUSTOM_HOLDER_SIZE = 'custom'
const counts = (values: number[]) => values.map((value) => ({ value, label: value === 0 ? 'None' : String(value) }))
const RIB_COUNTS = counts(RIB_CHOICES)

interface Props {
  resets: ResetAction[]
  config: BaseConfig
  setConfig: (config: BaseConfig) => void
  patch: (changes: Partial<BaseConfig>) => void
  customBaseSize: boolean
  setCustomBaseSize: (custom: boolean) => void
  magnetCountValue: MagnetCountChoice
  setMagnetCount: (count: MagnetCountChoice) => void
  maxSharedMagnetThickness: number
  maxSharedDepthClearance: number
  setSharedMagnets: (changes: SharedMagnetChanges) => void
  setSharedLabels: (enabled: boolean) => void
  setSharedMagnetPlacement: (changes: SharedMagnetPlacementChanges) => void
}

export function BasePanel({
  config,
  setConfig,
  patch,
  customBaseSize,
  setCustomBaseSize,
  magnetCountValue,
  setMagnetCount,
  maxSharedMagnetThickness,
  maxSharedDepthClearance,
  setSharedMagnets,
  setSharedLabels,
  setSharedMagnetPlacement,
  resets,
}: Props) {
  const { width, length } = footprint(config)
  const elongated = isElongated(config.shape)
  const sizes = SIZES_BY_SHAPE[config.shape]
  const standard = sizes.find((size) => size.width === width && (size.length ?? size.width) === length)
  const footprintDefaultHeight = defaultBaseHeight(config.width, config.length)
  const footprintDefaultFloor = defaultFloorThickness(config.width, config.length)
  const magnetCountOptions: { value: MagnetCountChoice; label: string }[] = [
    { value: AUTOMATIC_MAGNET_COUNT, label: `Auto · ${config.magnets.count}` },
    ...counts(MAGNET_CHOICES),
  ]
  const magnetLayoutOptions =
    config.magnets.patternVersion === 1 || supportsFivePocketCross(config.shape, config.width) ? MAGNET_LAYOUTS : MAGNET_LAYOUTS.slice(0, 1)

  const loadPreset = (size: SizePreset) => {
    posthog.capture('base_size_selected', { size: size.label, shape: config.shape })
    setCustomBaseSize(false)
    setConfig(presetFor(size, config.magnets.maxCount, config.magnets.patternVersion))
  }

  /** Keeps the current settings but adopts the new shape's usual footprint. */
  const changeShape = (shape: ShapeKind) => {
    if (shape === config.shape) return
    posthog.capture('base_shape_selected', { shape })
    const target = DEFAULT_SIZE[shape]
    setCustomBaseSize(false)
    const next = resized({ ...config, shape }, target.width, target.length ?? target.width)
    setConfig(next)
  }

  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
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
                setConfig(next)
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
                setConfig(next)
              }}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.magnets.count === 0 ? 'none' : `${trimNumber(config.magnets.diameter + config.magnets.clearance)} mm hole`}
            </span>
          }
        >
          {config.magnets.count > 0 && (
            <>
              <Dimension
                label="Magnet diameter"
                value={config.magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={config.magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
            </>
          )}
          <Choice
            label="Pocket layout"
            value={config.magnets.layout}
            defaultValue={BASE_DEFAULTS.magnets.layout}
            options={magnetLayoutOptions}
            onChange={(layout) => setSharedMagnets({ layout })}
          />
          {config.magnets.layout !== 'five-cross' && (
            <Choice
              label="Magnets per base"
              value={magnetCountValue}
              defaultValue={AUTOMATIC_MAGNET_COUNT}
              options={magnetCountOptions}
              onChange={setMagnetCount}
            />
          )}
          <FieldDescription>
            {config.magnets.layout === 'five-cross'
              ? 'The cross always provides one centre and four outer pockets.'
              : 'Automatic balances the footprint using the selected magnet dimensions.'}
          </FieldDescription>
        </Section>

        <Section title="Size Label">
          <ToggleSetting
            label="Size labels"
            checked={config.label.enabled}
            defaultChecked={BASE_DEFAULTS.label.enabled}
            onChange={(enabled) => {
              posthog.capture('base_marking_toggled', { enabled })
              setSharedLabels(enabled)
            }}
          />
          {config.label.enabled && (
            <Field>
              <FieldLabel htmlFor="marking-text" className="sr-only">
                Label text
              </FieldLabel>
              <Input
                id="marking-text"
                value={config.label.text ?? ''}
                placeholder={defaultLabel(config)}
                onChange={(e) => patch({ label: { ...config.label, text: e.currentTarget.value } })}
                className="readout"
              />
            </Field>
          )}
        </Section>

        <Section title="Construction" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(config.height)}mm</span>}>
          <Dimension
            label="Base height"
            value={config.height}
            min={2}
            max={12}
            step={0.25}
            defaultValue={footprintDefaultHeight}
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
          <Dimension
            label="Top thickness"
            value={config.floorThickness}
            min={0.4}
            max={Math.max(0.5, config.height - 0.5)}
            step={0.1}
            defaultValue={footprintDefaultFloor}
            onChange={(floorThickness) => patch({ floorThickness })}
          />
          <Choice
            label="Bottom edge"
            value={config.profile}
            defaultValue={BASE_DEFAULTS.profile}
            options={PROFILES}
            onChange={(profile) => patch({ profile })}
          />
          {config.profile !== 'straight' && (
            <Dimension
              label="Edge size"
              value={config.profileSize}
              min={0}
              max={safeEdgeSize(config)}
              step={0.1}
              defaultValue={BASE_DEFAULTS.profileSize}
              onChange={(profileSize) => patch({ profileSize })}
            />
          )}
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
          title="Internal Supports"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {config.ribs.count === 0 ? 'none' : `${config.ribs.count} spokes`}
            </span>
          }
        >
          {config.magnets.layout !== 'five-cross' && (
            <Choice
              label="Number of supports"
              value={config.ribs.count}
              defaultValue={BASE_DEFAULTS.ribs.count}
              options={RIB_COUNTS}
              onChange={(count) => patch({ ribs: { ...config.ribs, count } })}
            />
          )}
          {config.ribs.count > 0 && (
            <>
              <Dimension
                label="Support thickness"
                value={config.ribs.thickness}
                min={0.8}
                max={4}
                step={0.1}
                defaultValue={BASE_DEFAULTS.ribs.thickness}
                onChange={(thickness) => patch({ ribs: { ...config.ribs, thickness } })}
              />
              <Dimension
                label="Support height"
                value={config.ribs.height}
                min={0.4}
                max={Math.max(0.5, config.height - config.floorThickness)}
                step={0.1}
                defaultValue={BASE_DEFAULTS.ribs.height}
                onChange={(height) => patch({ ribs: { ...config.ribs, height } })}
              />
            </>
          )}
        </Section>

        {(config.magnets.count > 0 || config.label.enabled) && (
          <Section
            title="Fit & Detail"
            aside={
              config.magnets.count > 0 ? (
                <span className="readout text-xs text-muted-foreground">Ø{trimNumber(config.magnets.clearance)} fit</span>
              ) : undefined
            }
          >
            {config.magnets.count > 0 && (
              <>
                <Dimension
                  label="Magnet diameter clearance"
                  value={config.magnets.clearance}
                  min={0}
                  max={0.6}
                  step={0.05}
                  defaultValue={BASE_DEFAULTS.magnets.clearance}
                  onChange={(clearance) => setSharedMagnets({ clearance })}
                />
                <Dimension
                  label="Magnet depth clearance"
                  value={config.magnets.depthClearance}
                  min={0}
                  max={maxSharedDepthClearance}
                  step={0.05}
                  defaultValue={BASE_DEFAULTS.magnets.depthClearance}
                  onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
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
              </>
            )}
            {config.label.enabled && (
              <Dimension
                label="Label size"
                value={config.label.height}
                min={2}
                max={16}
                step={0.5}
                defaultValue={BASE_DEFAULTS.label.height}
                onChange={(height) => patch({ label: { ...config.label, height } })}
              />
            )}
            {config.label.enabled && (
              <Dimension
                label="Label thickness"
                value={config.label.emboss}
                min={0.2}
                max={1.5}
                step={0.1}
                defaultValue={BASE_DEFAULTS.label.emboss}
                onChange={(emboss) => patch({ label: { ...config.label, emboss } })}
              />
            )}
          </Section>
        )}
        <PanelFooter resets={resets} />
      </aside>
    </ScrollArea>
  )
}
