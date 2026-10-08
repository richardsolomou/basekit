import { Choice, Dimension, Section, ToggleSetting } from '@/components/controls'
import { FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { trimNumber } from '@/geometry/outline'
import {
  defaultPaintingTrayConfig,
  minimumPaintingTrayEdgeMargin,
  minimumPaintingTrayHeight,
  minimumPaintingTraySpacing,
  paintingHandleDescription,
  paintingTrayMagnetPocketCount,
  type paintingTrayLayout,
} from '@/geometry/paintingTray'
import type { PaintingHandleShape, PaintingTrayConfig } from '@/geometry/types'
import { BASE_DEFAULTS, RepositoryLink, type SharedMagnetChanges } from './shared'

const PAINTING_DEFAULTS = defaultPaintingTrayConfig()
const PAINTING_HANDLE_SHAPES: { value: PaintingHandleShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval barrel' },
  { value: 'flared', label: 'Flared base' },
  { value: 'pistol', label: 'Pistol grip' },
]

interface Props {
  paintingTray: PaintingTrayConfig
  setPaintingTray: (paintingTray: PaintingTrayConfig) => void
  paintingSize: ReturnType<typeof paintingTrayLayout>
  maxSharedMagnetThickness: number
  maxSharedDepthClearance: number
  setSharedMagnets: (changes: SharedMagnetChanges) => void
}

export function PaintingTrayPanel({
  paintingTray,
  setPaintingTray,
  paintingSize,
  maxSharedMagnetThickness,
  maxSharedDepthClearance,
  setSharedMagnets,
}: Props) {
  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Spray tray settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Magnet grid"
          aside={<span className="readout text-xs text-muted-foreground">{paintingTrayMagnetPocketCount(paintingTray)} holes</span>}
        >
          <Dimension
            label="Columns"
            value={paintingTray.columns}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={PAINTING_DEFAULTS.columns}
            onChange={(columns) => setPaintingTray({ ...paintingTray, columns: Math.round(columns) })}
          />
          <Dimension
            label="Rows"
            value={paintingTray.rows}
            min={1}
            max={12}
            step={1}
            unit=""
            defaultValue={PAINTING_DEFAULTS.rows}
            onChange={(rows) => setPaintingTray({ ...paintingTray, rows: Math.round(rows) })}
          />
          <Dimension
            label="Centre spacing"
            value={paintingTray.spacing}
            min={minimumPaintingTraySpacing(paintingTray)}
            max={80}
            step={0.5}
            defaultValue={PAINTING_DEFAULTS.spacing}
            onChange={(spacing) => setPaintingTray({ ...paintingTray, spacing })}
          />
          <Dimension
            label="Edge margin"
            value={paintingTray.edgeMargin}
            min={minimumPaintingTrayEdgeMargin(paintingTray)}
            max={40}
            step={0.5}
            defaultValue={PAINTING_DEFAULTS.edgeMargin}
            onChange={(edgeMargin) => setPaintingTray({ ...paintingTray, edgeMargin })}
          />
          <FieldDescription>Offset holes between rows give smaller and mixed-size bases more placement options.</FieldDescription>
        </Section>

        <Section
          title="Construction"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(paintingSize.width)} × {trimNumber(paintingSize.length)}mm
            </span>
          }
        >
          <Dimension
            label="Tray thickness"
            value={paintingTray.height}
            min={minimumPaintingTrayHeight(paintingTray)}
            max={8}
            step={0.1}
            defaultValue={PAINTING_DEFAULTS.height}
            onChange={(height) => setPaintingTray({ ...paintingTray, height })}
          />
          <FieldDescription>The flat tray has no rim or recess to block spray from the sides.</FieldDescription>
        </Section>

        <Section
          title="Magnets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(paintingTray.magnets.diameter + paintingTray.magnets.clearance)} mm hole
            </span>
          }
        >
          <Dimension
            label="Magnet diameter"
            value={paintingTray.magnets.diameter}
            min={2}
            max={8}
            step={0.5}
            defaultValue={BASE_DEFAULTS.magnets.diameter}
            onChange={(diameter) => setSharedMagnets({ diameter })}
          />
          <Dimension
            label="Magnet thickness"
            value={paintingTray.magnets.thickness}
            min={0.5}
            max={maxSharedMagnetThickness}
            step={0.1}
            defaultValue={BASE_DEFAULTS.magnets.thickness}
            onChange={(thickness) => setSharedMagnets({ thickness })}
          />
          <Dimension
            label="Magnet diameter clearance"
            value={paintingTray.magnets.clearance}
            min={0}
            max={0.6}
            step={0.05}
            defaultValue={BASE_DEFAULTS.magnets.clearance}
            onChange={(clearance) => setSharedMagnets({ clearance })}
          />
          <Dimension
            label="Magnet depth clearance"
            value={paintingTray.magnets.depthClearance}
            min={0}
            max={maxSharedDepthClearance}
            step={0.05}
            defaultValue={PAINTING_DEFAULTS.magnets.depthClearance}
            onChange={(depthClearance) => setSharedMagnets({ depthClearance })}
          />
          <FieldDescription>Pockets open at the top so installed magnets sit flush in an interleaved grid.</FieldDescription>
        </Section>
        <Section title="Handle" aside={<span className="readout text-xs text-muted-foreground">{paintingTray.handle.length} mm</span>}>
          <Choice
            label="Grip shape"
            value={paintingTray.handle.shape}
            defaultValue={PAINTING_DEFAULTS.handle.shape}
            options={PAINTING_HANDLE_SHAPES}
            onChange={(shape) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, shape } })}
          />
          <Dimension
            label="Grip length"
            value={paintingTray.handle.length}
            min={60}
            max={120}
            step={5}
            defaultValue={PAINTING_DEFAULTS.handle.length}
            onChange={(handleLength) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, length: handleLength } })}
          />
          <Dimension
            label="Grip width"
            value={paintingTray.handle.width}
            min={20}
            max={40}
            step={1}
            defaultValue={PAINTING_DEFAULTS.handle.width}
            onChange={(handleWidth) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, width: handleWidth } })}
          />
          <Dimension
            label="Lean angle"
            value={paintingTray.handle.angle}
            min={0}
            max={30}
            step={1}
            unit="°"
            defaultValue={PAINTING_DEFAULTS.handle.angle}
            onChange={(angle) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, angle } })}
          />
          <ToggleSetting
            label="Rounded end"
            checked={paintingTray.handle.roundedEnd}
            defaultChecked={PAINTING_DEFAULTS.handle.roundedEnd}
            onChange={(roundedEnd) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, roundedEnd } })}
          />
          <ToggleSetting
            label="Grip ribs"
            checked={paintingTray.handle.ribs}
            defaultChecked={PAINTING_DEFAULTS.handle.ribs}
            onChange={(ribs) => setPaintingTray({ ...paintingTray, handle: { ...paintingTray.handle, ribs } })}
          />
          <FieldDescription>
            {paintingHandleDescription(paintingTray)}. An engraved + extends past the grip for alignment. The flat end superglues beneath
            the tray and exports as a separate upright, support-free part.
          </FieldDescription>
        </Section>
        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
}
