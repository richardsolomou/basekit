import { Choice, Dimension, Section } from '@/components/controls'
import { FieldDescription } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { trimNumber } from '@/geometry/outline'
import { CLASSIC_STEM_HEIGHTS, defaultFlightStemConfig, stemNeckDiameter, stemOverallHeight } from '@/geometry/stem'
import type { FlightStemConfig } from '@/geometry/types'
import posthog from '@/lib/posthog'
import { RepositoryLink } from './shared'

const STEM_DEFAULTS = defaultFlightStemConfig()
const STEM_HEIGHTS = CLASSIC_STEM_HEIGHTS.map((value) => ({ value, label: `${value} mm` }))
const STEM_CONNECTIONS = [
  { value: 'peg' as const, label: 'Peg' },
  { value: 'ball' as const, label: 'Ball joint' },
]

interface Props {
  stem: FlightStemConfig
  setStem: (stem: FlightStemConfig) => void
}

export function StemPanel({ stem, setStem }: Props) {
  return (
    <ScrollArea className="h-full w-81 max-w-[85vw] shrink-0 border-border bg-card md:border-r">
      <aside aria-label="Stem settings" className="pb-4 [counter-reset:schedule]">
        <Section
          title="Stem"
          aside={<span className="readout text-xs text-muted-foreground">{trimNumber(stemOverallHeight(stem))}mm overall</span>}
        >
          <Choice
            label="Stem height"
            value={stem.bodyHeight}
            defaultValue={STEM_DEFAULTS.bodyHeight}
            options={STEM_HEIGHTS}
            onChange={(bodyHeight) => {
              posthog.capture('flight_stem_height_selected', { body_height: bodyHeight })
              setStem({ ...stem, bodyHeight })
            }}
          />
          <Dimension
            label="Body diameter"
            value={stem.bodyDiameter}
            min={stemNeckDiameter(stem)}
            max={8}
            step={0.1}
            defaultValue={STEM_DEFAULTS.bodyDiameter}
            onChange={(bodyDiameter) => setStem({ ...stem, bodyDiameter })}
          />
          <FieldDescription>Print upright from the flat foot, then glue it directly to the base.</FieldDescription>
        </Section>

        <Section
          title="Miniature Connection"
          aside={
            <span className="readout text-xs text-muted-foreground">
              Ø{trimNumber(stem.connection === 'peg' ? stem.modelPegDiameter : stem.ballDiameter)}
            </span>
          }
        >
          <Choice
            label="Connection"
            value={stem.connection}
            defaultValue={STEM_DEFAULTS.connection}
            options={STEM_CONNECTIONS}
            onChange={(connection) => {
              posthog.capture('flight_stem_connection_selected', { connection })
              const next = { ...stem, connection }
              setStem({ ...next, bodyDiameter: Math.max(next.bodyDiameter, stemNeckDiameter(next)) })
            }}
          />
          {stem.connection === 'peg' ? (
            <>
              <Dimension
                label="Model peg diameter"
                value={stem.modelPegDiameter}
                min={1}
                max={Math.min(4, stem.bodyDiameter)}
                step={0.1}
                defaultValue={STEM_DEFAULTS.modelPegDiameter}
                onChange={(modelPegDiameter) => setStem({ ...stem, modelPegDiameter })}
              />
              <Dimension
                label="Model peg length"
                value={stem.modelPegLength}
                min={1}
                max={8}
                step={0.1}
                defaultValue={STEM_DEFAULTS.modelPegLength}
                onChange={(modelPegLength) => setStem({ ...stem, modelPegLength })}
              />
            </>
          ) : (
            <Dimension
              label="Ball diameter"
              value={stem.ballDiameter}
              min={2}
              max={Math.min(8, stem.bodyDiameter * 2)}
              step={0.1}
              defaultValue={STEM_DEFAULTS.ballDiameter}
              onChange={(ballDiameter) => setStem({ ...stem, ballDiameter })}
            />
          )}
        </Section>

        <RepositoryLink />
      </aside>
    </ScrollArea>
  )
}
