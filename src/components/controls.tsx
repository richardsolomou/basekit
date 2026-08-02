import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border px-5 py-4">
      <header className="flex items-baseline justify-between">
        <h2 className="note">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** Keeps the fiddly settings out of the way, with their current value on the closed row. */
export function Drawer({ title, children, summary }: { title: string; children: ReactNode; summary?: string }) {
  return (
    <Collapsible className="group border-t border-border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-5 py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50">
        <ChevronRight className="size-3 text-muted-foreground transition-transform group-has-data-[panel-open]:rotate-90 group-has-data-[panel-open]:text-primary" />
        <span className="note">{title}</span>
        {summary && <span className="readout ml-auto text-xs text-muted-foreground group-has-data-[panel-open]:hidden">{summary}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-5 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}

interface FieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

export function Field({ label, value, min, max, step, unit = 'mm', disabled, onChange }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-40')}>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-normal text-foreground/85">
          {label}
        </Label>
        <span className="readout text-xs text-measure">
          {value.toFixed(step < 0.1 ? 2 : 1)}
          <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        id={id}
        aria-label={`${label} in ${unit}`}
        // Must be an array: the thumb count is taken from its length, and a bare
        // number falls back to [min, max] and renders two of them.
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </div>
  )
}

interface ChoiceProps<T extends string | number> {
  label?: string
  value: T
  options: readonly { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
  className?: string
}

// Spelled out so Tailwind's scanner sees the class names; a template string would
// be invisible to it.
const COLUMNS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
}

/**
 * Chip groups lay out on a grid rather than wrapping, so a trailing item never
 * stretches across a row on its own. Prefers the widest split that comes out even.
 */
export function gridColumns(count: number): string {
  return COLUMNS[[6, 5, 4, 3].find((n) => count % n === 0) ?? Math.min(count, 4)] ?? COLUMNS[4]
}

/**
 * Single-select toggle group. Values travel as strings because the group works in
 * strings, and are mapped back through the options so numbers survive the trip.
 */
export function Choice<T extends string | number>({ label, value, options, onChange, className }: ChoiceProps<T>) {
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-sm font-normal text-foreground/85">{label}</Label>}
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={1}
        value={[String(value)]}
        // Clicking the active item clears the group; keep the current value instead.
        onValueChange={(next) => {
          const picked = options.find((option) => String(option.value) === next[0])
          if (picked) onChange(picked.value)
        }}
        className={cn('grid w-full', gridColumns(options.length), className)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={String(option.value)} value={String(option.value)} title={option.hint} className="readout min-w-0 text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
