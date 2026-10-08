import { useState } from 'react'
import { Choice, Dimension, Section, SizeSelect, ToggleSetting } from '@/components/controls'
import { ScrollArea } from '@/components/ui/scroll-area'
import { defaultAdapterConfig, maxAdapterRecessDepth, minAdapterHeight } from '@/geometry/adapter'
import { isElongated, trimNumber } from '@/geometry/outline'
import { DEFAULT_SIZE, MAGNET_CHOICES, SIZES_BY_SHAPE } from '@/geometry/presets'
import { previewSegmentsFor } from '@/geometry/quality'
import type { AdapterConfig, AdapterFootprint, ShapeKind } from '@/geometry/types'
import posthog from '@/lib/posthog'
import {
  AUTOMATIC_MAGNET_COUNT,
  BASE_DEFAULTS,
  PROFILES,
  PanelFooter,
  type MagnetCountChoice,
  type ResetAction,
  type SharedMagnetChanges,
} from './shared'

const ADAPTER_DEFAULTS = defaultAdapterConfig()
const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'pill', label: 'Pill' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'polygon', label: 'Hex' },
]
const CUSTOM_SIZE = 'custom'
/** Rounds a limit inwards onto the controls' 0.1mm step, so they never offer a value the builder rejects. */
const floorTenth = (value: number) => Math.floor((value + 1e-6) * 10) / 10
const ceilTenth = (value: number) => Math.ceil((value - 1e-6) * 10) / 10

interface FootprintProps {
  name: string
  part: AdapterFootprint
  defaultPart: AdapterFootprint
  onChange: (part: AdapterFootprint) => void
}

function FootprintFields({ name, part, defaultPart, onChange }: FootprintProps) {
  const sizes = SIZES_BY_SHAPE[part.shape]
  const standard = sizes.find((size) => size.width === part.width && (size.length ?? size.width) === part.length)
  const [custom, setCustom] = useState(!standard)
  const elongated = isElongated(part.shape)
  return (
    <>
      <Choice
        label={`${name} shape`}
        value={part.shape}
        defaultValue={defaultPart.shape}
        options={SHAPES}
        onChange={(shape) => {
          const size = DEFAULT_SIZE[shape]
          setCustom(false)
          onChange({ shape, width: size.width, length: size.length ?? size.width })
        }}
      />
      <SizeSelect
        label={`${name} size`}
        value={!custom && standard ? standard.label : CUSTOM_SIZE}
        options={[
          ...sizes.map((size) => ({ value: size.label, use: size.use })),
          { value: CUSTOM_SIZE, label: 'Custom', use: 'exact dimensions' },
        ]}
        onChange={(label) => {
          if (label === CUSTOM_SIZE) {
            setCustom(true)
            return
          }
          const size = sizes.find((candidate) => candidate.label === label)
          if (!size) return
          setCustom(false)
          onChange({ shape: part.shape, width: size.width, length: size.length ?? size.width })
        }}
      />
      {(custom || !standard) && (
        <Dimension
          label={`${name} ${elongated ? 'width' : part.shape === 'round' ? 'diameter' : 'overall width'}`}
          value={part.width}
          min={15}
          max={180}
          step={0.5}
          defaultValue={defaultPart.width}
          onChange={(width) => onChange({ ...part, width, length: elongated ? part.length : width })}
        />
      )}
      {(custom || !standard) && elongated && (
        <Dimension
          label={`${name} depth`}
          value={part.length}
          min={15}
          max={180}
          step={0.5}
          defaultValue={defaultPart.length}
          onChange={(length) => onChange({ ...part, length })}
        />
      )}
    </>
  )
}

interface Props {
  adapter: AdapterConfig
  patchAdapter: (changes: Partial<AdapterConfig>) => void
  magnetCountValue: MagnetCountChoice
  setMagnetCount: (count: MagnetCountChoice) => void
  maxSharedMagnetThickness: number
  setSharedMagnets: (changes: SharedMagnetChanges) => void
  resets: ResetAction[]
}

export function AdapterPanel({
  adapter,
  patchAdapter,
  magnetCountValue,
  setMagnetCount,
  maxSharedMagnetThickness,
  setSharedMagnets,
  resets,
}: Props) {
  const magnets = adapter.magnets
  const minHeight = ceilTenth(minAdapterHeight(adapter))
  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Adapter settings" className="pb-4 [counter-reset:schedule]">
        <Section title="New Base">
          <FootprintFields
            name="New base"
            part={adapter.target}
            defaultPart={ADAPTER_DEFAULTS.target}
            onChange={(target) => {
              posthog.capture('adapter_target_selected', { shape: target.shape, width: target.width, length: target.length })
              patchAdapter({ target, segments: previewSegmentsFor(Math.max(target.width, target.length)) })
            }}
          />
        </Section>

        <Section title="Old Base">
          <FootprintFields
            name="Old base"
            part={adapter.source}
            defaultPart={ADAPTER_DEFAULTS.source}
            onChange={(source) => {
              posthog.capture('adapter_source_selected', { shape: source.shape, width: source.width, length: source.length })
              patchAdapter({ source })
            }}
          />
          <Dimension
            label="Fit clearance"
            value={adapter.clearance}
            min={0}
            max={2}
            step={0.05}
            defaultValue={ADAPTER_DEFAULTS.clearance}
            onChange={(clearance) => patchAdapter({ clearance })}
          />
        </Section>

        <Section title="Construction" aside={<span className="readout text-xs text-muted-foreground">{trimNumber(adapter.height)}mm</span>}>
          <Dimension
            label="Adapter height"
            value={adapter.height}
            min={minHeight}
            max={20}
            step={0.1}
            defaultValue={Math.max(ADAPTER_DEFAULTS.height, minHeight)}
            onChange={(height) => patchAdapter({ height })}
          />
          <Dimension
            label="Recess depth"
            value={adapter.recessDepth}
            min={0.5}
            max={Math.max(0.5, floorTenth(maxAdapterRecessDepth(adapter)))}
            step={0.1}
            defaultValue={ADAPTER_DEFAULTS.recessDepth}
            onChange={(recessDepth) => patchAdapter({ recessDepth })}
          />
          <Dimension
            label="Minimum wall"
            value={adapter.minWall}
            min={0.8}
            max={6}
            step={0.1}
            defaultValue={ADAPTER_DEFAULTS.minWall}
            onChange={(minWall) => patchAdapter({ minWall })}
          />
          <Choice
            label="Top edge"
            value={adapter.profile}
            defaultValue={ADAPTER_DEFAULTS.profile}
            options={PROFILES}
            onChange={(profile) => patchAdapter({ profile })}
          />
          {adapter.profile !== 'straight' && (
            <Dimension
              label="Edge size"
              value={adapter.profileSize}
              min={0}
              max={Math.min(3, floorTenth(adapter.height - 0.1))}
              step={0.1}
              defaultValue={ADAPTER_DEFAULTS.profileSize}
              onChange={(profileSize) => patchAdapter({ profileSize })}
            />
          )}
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {magnets.enabled ? `${trimNumber(magnets.diameter + magnets.clearance)} mm hole` : 'none'}
            </span>
          }
        >
          <ToggleSetting
            label="Magnet pockets"
            checked={magnets.enabled}
            defaultChecked={ADAPTER_DEFAULTS.magnets.enabled}
            onChange={(enabled) => {
              posthog.capture('adapter_magnets_toggled', { enabled })
              patchAdapter({ magnets: { ...magnets, enabled } })
            }}
          />
          {magnets.enabled && (
            <>
              <Dimension
                label="Magnet diameter"
                value={magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
              {magnets.layout !== 'five-cross' && (
                <Choice
                  label="Magnets per adapter"
                  value={magnetCountValue}
                  defaultValue={AUTOMATIC_MAGNET_COUNT}
                  options={[
                    { value: AUTOMATIC_MAGNET_COUNT, label: `Auto · ${magnets.count}` },
                    ...MAGNET_CHOICES.filter((count) => count > 0).map((count) => ({ value: count, label: String(count) })),
                  ]}
                  onChange={setMagnetCount}
                />
              )}
            </>
          )}
        </Section>
        <PanelFooter resets={resets} />
      </aside>
    </ScrollArea>
  )
}
