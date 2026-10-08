import { Badge } from '@/components/ui/badge'
import { adapterPocketDepth, adapterRecess } from '@/geometry/adapter'
import { defaultLabel, trimNumber } from '@/geometry/outline'
import { paintingHandleDescription, paintingTrayLayout, paintingTrayMagnetPocketCount } from '@/geometry/paintingTray'
import { movementTrayBaseLabel, movementTrayMagnetPocketCount } from '@/geometry/movementTray'
import { holderGroupLabel, holderLayout, holderMagnetPocketCount, holderPlan } from '@/geometry/holder'
import { stemOverallHeight } from '@/geometry/stem'
import { filamentEstimate } from '@/lib/filament'
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
  /** Weight of the solid the preview last built; absent until the first build. */
  grams?: number
}

/** `truncate` keeps free-form values such as filenames to one line. */
function Row({ label, value, truncate = false }: { label: string; value: string; truncate?: boolean }) {
  return (
    <>
      <dt className="note">{label}</dt>
      <dd className={`readout pr-3 text-right ${truncate ? 'min-w-0 truncate' : ''}`}>{value}</dd>
    </>
  )
}

/**
 * The title block of a drawing: what the part is, in the corner of the sheet. It
 * replaces a status bar rather than adding to one.
 */
export function TitleBlock({ config, status, name, grams }: Props) {
  return (
    <TitleFrame status={status} name={name}>
      <PartRows config={config} />
      {grams !== undefined && <Row label="Filament" value={filamentEstimate(grams)} />}
    </TitleFrame>
  )
}

function PartRows({ config }: { config: PartConfig }) {
  if (config.kind === 'token') {
    return (
      <>
        <Row truncate label="Text" value={config.text.trim() ? `“${config.text.trim()}”` : 'none'} />
        <Row truncate label="Image" value={config.image?.name ?? 'none'} />
        <Row label="Top edge" value={config.profile === 'straight' ? 'square' : `${trimNumber(config.profileSize)}mm ${config.profile}`} />
      </>
    )
  }
  if (config.kind === 'stem') {
    return (
      <>
        <Row label="Overall" value={`${trimNumber(stemOverallHeight(config))} mm`} />
        {config.connection === 'peg' ? (
          <Row label="Model peg" value={`Ø${trimNumber(config.modelPegDiameter)} × ${trimNumber(config.modelPegLength)} mm`} />
        ) : (
          <Row label="Ball joint" value={`Ø${trimNumber(config.ballDiameter)} mm`} />
        )}
      </>
    )
  }
  if (config.kind === 'adapter') {
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    const pocketDepth = adapterPocketDepth(config)
    return (
      <>
        <Row label="Recess" value={`${holderGroupLabel(adapterRecess(config))} × ${trimNumber(config.recessDepth)} mm`} />
        <Row
          label="Magnets"
          value={pocketDepth === 0 ? 'none' : `${config.magnets.count} × ${pocket} mm hole · ${trimNumber(pocketDepth)}mm deep`}
        />
      </>
    )
  }
  if (config.kind === 'holder') {
    const layout = holderLayout(config)
    const plan = holderPlan(config)
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    const slots = config.groups.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' · ')
    return (
      <>
        <Row label="Models" value={slots} />
        <Row label="Modules" value={`${plan.modules.length} in ${layout.unitsWide} × ${layout.unitsDeep}`} />
        {plan.omitted.length > 0 && (
          <Row label="Overflow" value={plan.omitted.map((group) => `${group.quantity}×${holderGroupLabel(group)}`).join(' · ')} />
        )}
        <Row label="Magnets" value={config.magnets.enabled ? `${holderMagnetPocketCount(config)} × ${pocket} mm hole` : 'none'} />
      </>
    )
  }
  if (config.kind === 'movement-tray') {
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    return (
      <>
        <Row label="Grid" value={`${config.columns} × ${config.ranks} · ${movementTrayBaseLabel(config)}`} />
        <Row label="Slots" value={`${trimNumber(config.slotDepth)} mm deep · +${trimNumber(config.slotClearance)} mm`} />
        <Row label="Magnets" value={config.magnets.enabled ? `${movementTrayMagnetPocketCount(config)} × ${pocket} mm hole` : 'none'} />
      </>
    )
  }
  if (config.kind === 'painting-tray') {
    const layout = paintingTrayLayout(config)
    const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
    return (
      <>
        <Row
          label="Grid"
          value={`${layout.columns}×${layout.rows} + ${Math.max(0, layout.columns - 1)}×${Math.max(0, layout.rows - 1)} · ${trimNumber(config.spacing)} mm pitch`}
        />
        <Row label="Tray" value={`${trimNumber(layout.width)} × ${trimNumber(layout.length)} × ${trimNumber(config.height)} mm`} />
        <Row label="Magnets" value={`${paintingTrayMagnetPocketCount(config)} × ${pocket} mm hole`} />
        <Row label="Handle" value={paintingHandleDescription(config)} />
      </>
    )
  }
  const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
  const pocketDepth = trimNumber(config.magnets.thickness + config.magnets.depthClearance)

  return (
    <>
      <Row
        label="Magnets"
        value={config.magnets.count === 0 ? 'none' : `${config.magnets.count} × ${pocket} mm hole · ${pocketDepth}mm deep`}
      />
      <Row label="Label" value={config.label.enabled ? `“${config.label.text?.trim() || defaultLabel(config)}”` : 'none'} />
    </>
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
          the part itself, so the block carries only what nothing else shows. Nothing
          here claims the mesh is watertight: a badge that did stayed lit right through
          the one real topology bug this has had, so that is asserted against a real
          export in the tests. The filament weight is of the solid, which a slicer's
          walls and infill will print lighter than. */}
      <dl className="grid grid-cols-[5.5rem_1fr] items-baseline text-xs *:py-1 [&>dd]:pl-3 [&>dt]:border-r [&>dt]:border-border [&>dt]:px-3">
        {children}
      </dl>
    </footer>
  )
}
