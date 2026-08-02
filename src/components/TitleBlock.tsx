import { Badge } from '@/components/ui/badge'
import { defaultLabel, trimNumber } from '@/geometry/outline'
import type { BaseConfig } from '@/geometry/types'

interface Props {
  config: BaseConfig
  /**
   * Only whether the config builds. There is deliberately no pending state: a
   * rebuild takes about 15ms, so a spinner would strobe on every drag step
   * without ever telling anyone anything.
   */
  status: 'ready' | 'blocked'
  name: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="note">{label}</dt>
      <dd className="readout pr-3 text-right">{value}</dd>
    </>
  )
}

/**
 * The title block of a drawing: what the part is, in the corner of the sheet. It
 * replaces a status bar rather than adding to one.
 */
export function TitleBlock({ config, status, name }: Props) {
  const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
  const thickness = trimNumber(config.magnets.thickness)

  return (
    <footer className="pointer-events-none absolute right-3 bottom-3 w-56 sm:right-5 sm:bottom-5 sm:w-72 border-2 border-measure/50 bg-card/90 text-card-foreground backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b-2 border-measure/50 px-3 py-2">
        <span className="readout truncate text-xs text-measure">{name}</span>
        <Badge variant={status === 'blocked' ? 'destructive' : 'secondary'} className="note ms-auto">
          {status}
        </Badge>
      </div>

      {/* Footprint and height are already called out by the dimension leaders on
          the part itself, so the block carries only what nothing else shows. Mesh
          statistics used to sit below: a triangle count nobody acts on, a mass in
          grams of an assumed material, and a "watertight" badge that only tested
          the mesh was non-empty — it stayed lit right through the one real topology
          bug this has had. Watertightness is asserted against a real export in the
          tests instead. */}
      <dl className="grid grid-cols-[5.5rem_1fr] items-baseline text-xs *:py-1 [&>dd]:pl-3 [&>dt]:border-r [&>dt]:border-border [&>dt]:px-3">
        <Row label="Magnets" value={config.magnets.count === 0 ? 'none' : `${config.magnets.count} × Ø${pocket} · ${thickness}mm`} />
        <Row
          label="Marking"
          value={config.label.enabled && config.underside === 'well' ? `“${config.label.text?.trim() || defaultLabel(config)}”` : 'none'}
        />
      </dl>
    </footer>
  )
}
