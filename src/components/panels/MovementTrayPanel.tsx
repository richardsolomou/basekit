import { useState } from 'react'
import { Choice, Dimension, Section, SizeSelect, ToggleSetting } from '@/components/controls'
import { FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  defaultMovementTrayConfig,
  minimumMovementTrayFloor,
  MIN_MOVEMENT_TRAY_RIM,
  movementTrayFootprint,
  movementTrayMagnetPocketCount,
} from '@/geometry/movementTray'
import { trimNumber } from '@/geometry/outline'
import { SIZES_BY_SHAPE } from '@/geometry/presets'
import type { MovementTrayConfig, MovementTrayShape } from '@/geometry/types'
import { BASE_DEFAULTS, RepositoryLink, type SharedMagnetChanges } from './shared'

const MOVEMENT_DEFAULTS = defaultMovementTrayConfig()
const SHAPES: { value: MovementTrayShape; label: string }[] = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'round', label: 'Round' },
]
const DEFAULT_SIZES: Record<MovementTrayShape, string> = { rect: '25×25', round: '25' }
const CUSTOM_SIZE = 'custom'

const standardSize = (tray: MovementTrayConfig) =>
  SIZES_BY_SHAPE[tray.shape].find((size) => size.width === tray.width && (size.length ?? size.width) === tray.length)

interface Props {
  movementTray: MovementTrayConfig
  setMovementTray: (movementTray: MovementTrayConfig) => void
  maxSharedMagnetThickness: number
  setSharedMagnets: (changes: SharedMagnetChanges) => void
}

export function MovementTrayPanel({ movementTray, setMovementTray, maxSharedMagnetThickness, setSharedMagnets }: Props) {
  const [custom, setCustom] = useState(() => !standardSize(movementTray))
  const standard = standardSize(movementTray)
  const resize = (shape: MovementTrayShape, width: number, length: number) =>
    setMovementTray({ ...movementTray, ...movementTrayFootprint(shape, width, length) })

  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Movement tray settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Unit"
          aside={<span className="readout text-xs text-muted-foreground">{movementTray.columns * movementTray.ranks} bases</span>}
        >
          <Choice
            label="Base shape"
            value={movementTray.shape}
            defaultValue={MOVEMENT_DEFAULTS.shape}
            options={SHAPES}
            onChange={(shape) => {
              const size = SIZES_BY_SHAPE[shape].find((candidate) => candidate.label === DEFAULT_SIZES[shape])!
              setCustom(false)
              resize(shape, size.width, size.length ?? size.width)
            }}
          />
          <SizeSelect
            value={!custom && standard ? standard.label : CUSTOM_SIZE}
            options={[
              ...SIZES_BY_SHAPE[movementTray.shape].map((size) => ({ value: size.label, use: size.use })),
              { value: CUSTOM_SIZE, label: 'Custom', use: 'exact dimensions' },
            ]}
            onChange={(label) => {
              if (label === CUSTOM_SIZE) {
                setCustom(true)
                return
              }
              const size = SIZES_BY_SHAPE[movementTray.shape].find((candidate) => candidate.label === label)
              if (!size) return
              setCustom(false)
              resize(movementTray.shape, size.width, size.length ?? size.width)
            }}
          />
          {custom && (
            <>
              <Dimension
                label={movementTray.shape === 'round' ? 'Base diameter' : 'Base width'}
                value={movementTray.width}
                min={10}
                max={120}
                step={0.5}
                onChange={(width) => resize(movementTray.shape, width, movementTray.shape === 'round' ? width : movementTray.length)}
              />
              {movementTray.shape === 'rect' && (
                <Dimension
                  label="Base depth"
                  value={movementTray.length}
                  min={10}
                  max={120}
                  step={0.5}
                  onChange={(length) => resize(movementTray.shape, movementTray.width, length)}
                />
              )}
            </>
          )}
          <Dimension
            label="Columns"
            value={movementTray.columns}
            min={1}
            max={10}
            step={1}
            unit=""
            defaultValue={MOVEMENT_DEFAULTS.columns}
            onChange={(columns) => setMovementTray({ ...movementTray, columns: Math.round(columns) })}
          />
          <Dimension
            label="Ranks"
            value={movementTray.ranks}
            min={1}
            max={10}
            step={1}
            unit=""
            defaultValue={MOVEMENT_DEFAULTS.ranks}
            onChange={(ranks) => setMovementTray({ ...movementTray, ranks: Math.round(ranks) })}
          />
        </Section>

        <Section
          title="Slots"
          aside={<span className="readout text-xs text-muted-foreground">{trimNumber(movementTray.slotDepth)}mm deep</span>}
        >
          <Dimension
            label="Slot depth"
            value={movementTray.slotDepth}
            min={0.5}
            max={6}
            step={0.5}
            defaultValue={MOVEMENT_DEFAULTS.slotDepth}
            onChange={(slotDepth) => setMovementTray({ ...movementTray, slotDepth })}
          />
          <Dimension
            label="Slot clearance"
            value={movementTray.slotClearance}
            min={0}
            max={2}
            step={0.1}
            defaultValue={MOVEMENT_DEFAULTS.slotClearance}
            onChange={(slotClearance) => setMovementTray({ ...movementTray, slotClearance })}
          />
          <FieldDescription>
            {movementTray.shape === 'rect'
              ? 'Rectangular bases share one recess so ranks keep base contact.'
              : 'Round bases each get a slot, with a thin web between neighbours.'}
          </FieldDescription>
        </Section>

        <Section title="Construction">
          <Dimension
            label="Floor thickness"
            value={movementTray.floorThickness}
            min={minimumMovementTrayFloor(movementTray)}
            max={6}
            step={0.1}
            defaultValue={MOVEMENT_DEFAULTS.floorThickness}
            onChange={(floorThickness) => setMovementTray({ ...movementTray, floorThickness })}
          />
          <Dimension
            label="Rim width"
            value={movementTray.rim}
            min={MIN_MOVEMENT_TRAY_RIM}
            max={10}
            step={0.5}
            defaultValue={MOVEMENT_DEFAULTS.rim}
            onChange={(rim) => setMovementTray({ ...movementTray, rim })}
          />
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {movementTray.magnets.enabled ? `${movementTrayMagnetPocketCount(movementTray)} holes` : 'none'}
            </span>
          }
        >
          <ToggleSetting
            label="Slot magnets"
            checked={movementTray.magnets.enabled}
            defaultChecked={MOVEMENT_DEFAULTS.magnets.enabled}
            onChange={(enabled) => setMovementTray({ ...movementTray, magnets: { ...movementTray.magnets, enabled } })}
          />
          {movementTray.magnets.enabled && (
            <>
              <Dimension
                label="Magnet diameter"
                value={movementTray.magnets.diameter}
                min={2}
                max={8}
                step={0.5}
                defaultValue={BASE_DEFAULTS.magnets.diameter}
                onChange={(diameter) => setSharedMagnets({ diameter })}
              />
              <Dimension
                label="Magnet thickness"
                value={movementTray.magnets.thickness}
                min={0.5}
                max={maxSharedMagnetThickness}
                step={0.1}
                defaultValue={BASE_DEFAULTS.magnets.thickness}
                onChange={(thickness) => setSharedMagnets({ thickness })}
              />
              <Dimension
                label="Magnet diameter clearance"
                value={movementTray.magnets.clearance}
                min={0}
                max={0.6}
                step={0.05}
                defaultValue={BASE_DEFAULTS.magnets.clearance}
                onChange={(clearance) => setSharedMagnets({ clearance })}
              />
              <Dimension
                label="Magnet depth clearance"
                value={movementTray.magnets.depthClearance}
                min={0}
                max={0.5}
                step={0.05}
                defaultValue={MOVEMENT_DEFAULTS.magnets.depthClearance}
                onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
              />
              <FieldDescription>Pockets follow the base pattern, so magnetised bases land on matching magnets.</FieldDescription>
            </>
          )}
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
}
