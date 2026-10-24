import { Download, Plus, Trash2 } from 'lucide-react'
import { Dimension, Section } from '@/components/controls'
import { Button } from '@/components/ui/button'
import { FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { trimNumber } from '@/core/geometry/outline'
import { defaultPaintRackConfig, paintRackLayout, POCKET_CLEARANCE, type PaintRackPieceKind } from '@/core/geometry/paintRack'
import type { PaintRackConfig, PaintRackItem } from '@/core/geometry/types'
import posthog from '@/lib/posthog'
import { PanelFooter, type ResetAction } from './shared'

const RACK_DEFAULTS = defaultPaintRackConfig()
const PIECE_LABELS: Record<PaintRackPieceKind, string> = {
  'left-end': 'End',
  module: 'Module',
  corner: 'Corner',
  'right-end': 'End',
}

interface Props {
  resets: ResetAction[]
  paintRack: PaintRackConfig
  setPaintRack: (paintRack: PaintRackConfig) => void
  exporting: boolean
  /** Downloads one piece, numbered as in the full download. */
  exportPiece: (index: number) => void
}

export function PaintRackPanel({ paintRack, setPaintRack, exporting, exportPiece, resets }: Props) {
  const layout = paintRackLayout(paintRack)
  const patch = (changes: Partial<PaintRackConfig>) => setPaintRack({ ...paintRack, ...changes })
  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Paint rack settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Pieces"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {layout.bottles} bottles{layout.brushes > 0 ? ` · ${layout.brushes} brushes` : ''}
            </span>
          }
        >
          <Dimension
            label="Rows"
            value={paintRack.rows}
            min={1}
            max={6}
            step={1}
            unit=""
            defaultValue={RACK_DEFAULTS.rows}
            onChange={(rows) => patch({ rows: Math.round(rows) })}
          />
          <AddPieces side="left" paintRack={paintRack} patch={patch} />
          <ol aria-label="Pieces from left to right" className="flex flex-col">
            {layout.pieces.map((piece, index) => {
              const item = piece.item === undefined ? undefined : paintRack.items[piece.item]
              const remove = () =>
                piece.kind === 'left-end'
                  ? patch({ leftEnd: false })
                  : piece.kind === 'right-end'
                    ? patch({ rightEnd: false })
                    : patch({ items: paintRack.items.filter((entry) => entry !== item) })
              return (
                <li key={item?.id ?? piece.kind} className="flex items-center gap-2 border-b border-border py-1.5">
                  <span className="readout w-5 text-xs text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{PIECE_LABELS[piece.kind]}</span>
                  {item?.kind === 'module' && (
                    <div className="w-24">
                      <Dimension
                        label={`Columns of piece ${index + 1}`}
                        value={item.columns}
                        min={1}
                        max={10}
                        step={1}
                        unit="cols"
                        compact
                        onChange={(columns) =>
                          patch({
                            items: paintRack.items.map((entry) => (entry === item ? { ...entry, columns: Math.round(columns) } : entry)),
                          })
                        }
                      />
                    </div>
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Download piece ${index + 1}`}
                    disabled={exporting}
                    onClick={() => exportPiece(index)}
                  >
                    <Download />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove piece ${index + 1}`}
                    disabled={item !== undefined && paintRack.items.length === 1}
                    onClick={remove}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ol>
          <AddPieces side="right" paintRack={paintRack} patch={patch} />
          <FieldDescription>Add pieces as you need them. Printed pieces never change, so download only the new one.</FieldDescription>
        </Section>

        <Section title="Cells">
          <Dimension
            label="Cell size"
            value={paintRack.pitch}
            min={Math.ceil(paintRack.holeDiameter + paintRack.wall + 2)}
            max={50}
            step={0.5}
            defaultValue={RACK_DEFAULTS.pitch}
            onChange={(pitch) => patch({ pitch })}
          />
          <Dimension
            label="Brush holes"
            value={paintRack.brushDiameter}
            min={4}
            max={20}
            step={0.5}
            defaultValue={RACK_DEFAULTS.brushDiameter}
            onChange={(brushDiameter) => patch({ brushDiameter })}
          />
          <FieldDescription>Brush holes must clear the widest part of a handle.</FieldDescription>
        </Section>

        <Section
          title="Steps"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {trimNumber(layout.width)} × {trimNumber(layout.length)}mm
            </span>
          }
        >
          <Dimension
            label="Front deck height"
            value={paintRack.frontHeight}
            min={paintRack.seatDepth + paintRack.wall}
            max={60}
            step={0.5}
            defaultValue={RACK_DEFAULTS.frontHeight}
            onChange={(frontHeight) => patch({ frontHeight })}
          />
          <Dimension
            label="Rise per row"
            value={paintRack.rise}
            min={0}
            max={40}
            step={0.5}
            defaultValue={RACK_DEFAULTS.rise}
            onChange={(rise) => patch({ rise })}
          />
        </Section>

        <Section
          title="Pot pockets"
          aside={
            <span className="readout text-xs text-muted-foreground">
              {paintRack.pocketDepth > 0 ? `Ø${trimNumber(paintRack.pocketDiameter)}` : 'flat deck'}
            </span>
          }
        >
          <Dimension
            label="Pocket depth"
            value={paintRack.pocketDepth}
            min={0}
            max={20}
            step={0.5}
            defaultValue={RACK_DEFAULTS.pocketDepth}
            onChange={(pocketDepth) => patch({ pocketDepth })}
          />
          <Dimension
            label="Pocket diameter"
            value={paintRack.pocketDiameter}
            min={paintRack.seatDiameter + paintRack.wall * 2 + 1}
            max={Math.floor((paintRack.pitch - paintRack.wall - POCKET_CLEARANCE * 2) * 2) / 2}
            step={0.1}
            disabled={paintRack.pocketDepth === 0}
            defaultValue={RACK_DEFAULTS.pocketDiameter}
            onChange={(pocketDiameter) => patch({ pocketDiameter })}
          />
          <FieldDescription>Sized for Citadel pots. Zero depth leaves a flat deck that prints faster.</FieldDescription>
        </Section>

        <Section
          title="Dropper seats"
          aside={<span className="readout text-xs text-muted-foreground">Ø{trimNumber(paintRack.holeDiameter)} hole</span>}
        >
          <Dimension
            label="Seat diameter"
            value={paintRack.seatDiameter}
            min={paintRack.holeDiameter + 1}
            max={Math.min(paintRack.pitch - paintRack.wall * 3 - 1, paintRack.pocketDiameter - paintRack.wall * 2 - 1)}
            step={0.5}
            defaultValue={RACK_DEFAULTS.seatDiameter}
            onChange={(seatDiameter) => patch({ seatDiameter })}
          />
          <Dimension
            label="Seat depth"
            value={paintRack.seatDepth}
            min={2}
            max={paintRack.frontHeight - paintRack.wall}
            step={0.5}
            defaultValue={RACK_DEFAULTS.seatDepth}
            onChange={(seatDepth) => patch({ seatDepth })}
          />
          <Dimension
            label="Push-out hole"
            value={paintRack.holeDiameter}
            min={8}
            max={paintRack.seatDiameter - 1}
            step={0.5}
            defaultValue={RACK_DEFAULTS.holeDiameter}
            onChange={(holeDiameter) => patch({ holeDiameter })}
          />
          <Dimension
            label="Wall thickness"
            value={paintRack.wall}
            min={0.8}
            max={2}
            step={0.05}
            defaultValue={RACK_DEFAULTS.wall}
            onChange={(wall) => patch({ wall, frontHeight: Math.max(paintRack.frontHeight, paintRack.seatDepth + wall) })}
          />
          <FieldDescription>Sized for Vallejo, AK and Army Painter droppers. Print with supports off.</FieldDescription>
        </Section>

        <PanelFooter resets={resets} />
      </aside>
    </ScrollArea>
  )
}

/** Adds to one side of the rack. An end closes that side, so nothing more can go beyond it until it is removed. */
function AddPieces({
  side,
  paintRack,
  patch,
}: {
  side: 'left' | 'right'
  paintRack: PaintRackConfig
  patch: (changes: Partial<PaintRackConfig>) => void
}) {
  const add = (kind: PaintRackItem['kind']) => {
    posthog.capture('paint_rack_piece_added', { kind, side })
    const item: PaintRackItem = { id: crypto.randomUUID(), kind, columns: 5 }
    patch({ items: side === 'left' ? [item, ...paintRack.items] : [...paintRack.items, item] })
  }
  const closed = side === 'left' ? paintRack.leftEnd : paintRack.rightEnd
  return (
    <div className="flex items-center gap-1.5">
      <span className="note flex-1 text-xs text-muted-foreground">Add to the {side}</span>
      <Button size="xs" variant="outline" aria-label={`Add a module to the ${side}`} disabled={closed} onClick={() => add('module')}>
        <Plus /> Module
      </Button>
      <Button size="xs" variant="outline" aria-label={`Add a corner to the ${side}`} disabled={closed} onClick={() => add('corner')}>
        <Plus /> Corner
      </Button>
      <Button
        size="xs"
        variant="outline"
        aria-label={`Add an end to the ${side}`}
        disabled={closed}
        onClick={() => patch(side === 'left' ? { leftEnd: true } : { rightEnd: true })}
      >
        <Plus /> End
      </Button>
    </div>
  )
}
