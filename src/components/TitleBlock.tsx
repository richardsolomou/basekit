import { defaultLabel, footprint, isElongated, trimNumber } from '@/geometry/outline'
import type { BaseConfig, BaseStats } from '@/geometry/types'
import { cn } from '@/lib/utils'

interface Props {
  config: BaseConfig
  stats?: BaseStats
  status: 'ready' | 'solving' | 'blocked'
  name: string
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="note">{label}</dt>
      <dd className="readout text-right text-foreground">{value}</dd>
    </>
  )
}

/**
 * The title block of a drawing: what the part is, in the corner of the sheet. It
 * carries the spec you would otherwise have to read back off the controls, and
 * replaces a status bar rather than adding to one.
 */
export function TitleBlock({ config, stats, status, name }: Props) {
  const { width, length } = footprint(config)
  const pocket = trimNumber(config.magnets.diameter + config.magnets.clearance)
  const depth = trimNumber(config.underside === 'well' ? config.height - config.floorThickness : config.magnets.depth)

  return (
    <footer className="pointer-events-none absolute bottom-5 left-5 w-72 border border-border bg-background/85 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            status === 'blocked' ? 'bg-destructive' : status === 'solving' ? 'animate-pulse bg-measure' : 'bg-muted-foreground',
          )}
        />
        <span className="readout truncate text-xs text-foreground">{name}</span>
        <span className="note ml-auto">{status}</span>
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <Row
          label="Footprint"
          value={isElongated(config.shape) ? `${trimNumber(width)} × ${trimNumber(length)}` : `Ø${trimNumber(width)}`}
        />
        <Row label="Height" value={`${trimNumber(config.height)}mm`} />
        <Row label="Magnets" value={config.magnets.count === 0 ? 'none' : `${config.magnets.count} × Ø${pocket} · ${depth}mm`} />
        <Row
          label="Marking"
          value={config.label.enabled && config.underside === 'well' ? `“${config.label.text?.trim() || defaultLabel(config)}”` : 'none'}
        />
      </dl>

      <div className="readout flex items-center gap-2 border-t border-border px-3 py-2 text-[0.6875rem] whitespace-nowrap text-muted-foreground">
        {stats ? (
          <>
            <span>{stats.triangles.toLocaleString()} tris</span>
            <span>{(stats.volume / 1000).toFixed(2)} cm³</span>
            <span>{stats.grams.toFixed(2)}g</span>
            <span className={cn('ml-auto', stats.solid && 'text-measure')}>{stats.solid ? 'watertight' : 'empty'}</span>
          </>
        ) : (
          <span>measuring…</span>
        )}
      </div>
    </footer>
  )
}
