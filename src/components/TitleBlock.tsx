import { Badge } from '@/components/ui/badge'
import { defaultLabel, trimNumber } from '@/geometry/outline'
import { paintingHandleDescription, paintingTrayLayout, paintingTrayMagnetPocketCount } from '@/geometry/paintingTray'
import { holderGroupLabel, holderLayout, holderMagnetPocketCount, holderPlan } from '@/geometry/holder'
import { stemOverallHeight } from '@/geometry/stem'
import type { PartConfig } from '@/geometry/types'

interface Props {
  config: PartConfig
  /**
   * Only whether the config builds. There is deliberately no pending preview
   * state: a typical rebuild takes about 15ms, so a spinner would strobe on every
   * drag step without ever telling anyone anything.
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
  if (config.kind === 'stem') {
    return (
      <TitleFrame status={status} name={name}>
        <Row label="Overall" value={`${trimNumber(stemOverallHeight(config))} mm`} />
        {config.connection === 'peg' ? (
          <Row label="Model peg" value={`Ø${trimNumber(config.modelPegDiameter)} × ${trimNumber(config.modelPegLength)} mm`} />
        ) : (
          <Row label="Ball joint" value={`Ø${trimNumber(config.ballDiameter)} mm`} />
        )}
      </TitleFrame>
    )
  }
  if (config.kind === 'holder') {
    const layout = holderLayout(config)
    const plan = holderPlan(config)
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    const slots = config.groups.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' · ')
    return (
      <TitleFrame status={status} name={name}>
        <Row label="Models" value={slots} />
        <Row label="Modules" value={`${plan.modules.length} in ${layout.unitsWide} × ${layout.unitsDeep}`} />
        {plan.omitted.length > 0 && (
          <Row label="Overflow" value={plan.omitted.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' · ')} />
        )}
        <Row label="Magnets" value={config.magnets.enabled ? `${holderMagnetPocketCount(config)} × ${pocket} mm hole` : 'none'} />
      </TitleFrame>
    )
  }
  if (config.kind === 'painting-tray') {
    const layout = paintingTrayLayout(config)
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    return (
      <TitleFrame status={status} name={name}>
        <Row
          label="Grid"
          value={`${layout.columns}×${layout.rows} + ${Math.max(0, layout.columns - 1)}×${Math.max(0, layout.rows - 1)} · ${trimNumber(config.spacing)} mm pitch`}
        />
        <Row label="Tray" value={`${trimNumber(layout.width)} × ${trimNumber(layout.length)} × ${trimNumber(config.height)} mm`} />
        <Row label="Magnets" value={`${paintingTrayMagnetPocketCount(config)} × ${pocket} mm hole`} />
        <Row label="Handle" value={paintingHandleDescription(config)} />
      </TitleFrame>
    )
  }
  const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
  const pocketDepth = trimNumber(config.magnets.thickness + config.magnets.depthClearance)

  return (
    <TitleFrame status={status} name={name}>
      <Row
        label="Magnets"
        value={config.magnets.count === 0 ? 'none' : `${config.magnets.count} × ${pocket} mm hole · ${pocketDepth}mm deep`}
      />
      <Row label="Size label" value={config.label.enabled ? `“${config.label.text?.trim() || defaultLabel(config)}”` : 'none'} />
    </TitleFrame>
  )
}

function TitleFrame({ status, name, children }: { status: Props['status']; name: string; children: React.ReactNode }) {
  return (
    <footer className="pointer-events-none absolute right-3 bottom-3 w-56 border-2 border-measure/50 bg-card/90 text-card-foreground backdrop-blur-sm sm:right-5 sm:bottom-5 sm:w-72">
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
        {children}
      </dl>
    </footer>
  )
}
