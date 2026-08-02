import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** A group of always-visible controls, with an optional figure in the header. */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <FieldSet className="gap-3 border-t border-border px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLegend variant="label" className="note schedule-index mb-0">
          {title}
        </FieldLegend>
        {aside}
      </div>
      <FieldGroup className="gap-3">{children}</FieldGroup>
    </FieldSet>
  )
}

/**
 * A fold in the panel's accordion, keeping the fiddly settings out of the way
 * with their current value on the closed row.
 */
export function Fold({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <AccordionItem value={title} className="border-t border-b-0 border-border px-5">
      <AccordionTrigger className="gap-3 py-3 hover:no-underline">
        <span className="note schedule-index">{title}</span>
        {summary && (
          <span className="readout ms-auto pe-2 text-xs text-muted-foreground group-aria-expanded/accordion-trigger:invisible">
            {summary}
          </span>
        )}
      </AccordionTrigger>
      <AccordionContent>
        <FieldGroup className="gap-3 pb-2">{children}</FieldGroup>
      </AccordionContent>
    </AccordionItem>
  )
}

interface DimensionProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  onChange: (value: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const quantise = (value: number, step: number) => Math.round(value / step) * step

/**
 * A dimension: type an exact figure, or drag its label to scrub. Typing is the
 * point — a slider cannot land on 28.5 reliably, and these are millimetres
 * someone is going to print.
 */
export function Dimension({ label, value, min, max, step, unit = 'mm', disabled, onChange }: DimensionProps) {
  const id = useId()
  const [text, setText] = useState<string | undefined>()

  /**
   * Listeners go on at pointerdown rather than through an effect: setting a ref
   * does not re-render, so an effect would never see the drag begin. Props are
   * captured here and stay correct because every move recomputes from the value
   * the drag started on.
   */
  const startScrub = (event: ReactPointerEvent) => {
    if (disabled) return
    const startX = event.clientX
    const from = value
    const span = (max - min) / 240 // a full sweep in roughly one panel width
    const move = (moved: PointerEvent) => onChange(clamp(quantise(from + (moved.clientX - startX) * span, step), min, max))
    const stop = () => {
      document.removeEventListener('pointermove', move)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'ew-resize'
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop, { once: true })
  }

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    setText(undefined)
    if (Number.isFinite(parsed)) onChange(clamp(quantise(parsed, step), min, max))
  }

  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldLabel htmlFor={id} onPointerDown={startScrub} className="cursor-ew-resize touch-none font-normal">
        {label}
      </FieldLabel>
      <InputGroup className="w-28 shrink-0">
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          aria-label={`${label} in ${unit}`}
          value={text ?? value.toFixed(step < 0.1 ? 2 : 1)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => setText(event.currentTarget.value)}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          className="readout text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="text-xs">{unit}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    </Field>
  )
}

/**
 * Chip groups lay out on a grid rather than wrapping, so a trailing item never
 * stretches across a row on its own. Prefers the widest split that comes out even.
 */
function columns(count: number): number {
  return [6, 5, 4, 3].find((n) => count % n === 0) ?? Math.min(count, 4)
}

/** The column count is data-driven, so it goes through a style rather than a class. */
const gridOf = (count: number) => ({ gridTemplateColumns: `repeat(${columns(count)}, minmax(0, 1fr))` })

interface ChoiceProps<T extends string | number> {
  /** Names the group for a screen reader; `hideLabel` when the chips read for themselves. */
  label: string
  hideLabel?: boolean
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

/**
 * Single-select toggle group. Values travel as strings because the group works in
 * strings, and are mapped back through the options so numbers survive the trip.
 */
export function Choice<T extends string | number>({ label, hideLabel, value, options, onChange }: ChoiceProps<T>) {
  return (
    <Field>
      {!hideLabel && <FieldLabel className="font-normal">{label}</FieldLabel>}
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={1}
        aria-label={label}
        value={[String(value)]}
        // Clicking the active item clears the group; keep the current value instead.
        onValueChange={(next) => {
          const picked = options.find((option) => String(option.value) === next[0])
          if (picked) onChange(picked.value)
        }}
        className="grid w-full"
        style={gridOf(options.length)}
      >
        {options.map((option) => (
          <ToggleGroupItem key={String(option.value)} value={String(option.value)} className="readout min-w-0 text-xs">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}

export interface SizeOption {
  value: string
  use: string
}

/**
 * Standard sizes collapse into a select: the round family alone runs to a dozen
 * entries, and a list that long reflows the whole panel every time the shape
 * changes. What the size is for rides inside the trigger rather than in a caption
 * under it, so dialling in a footprint off the standard range does not shift
 * everything below.
 */
export function SizeSelect({
  value,
  options,
  onChange,
}: {
  value: string | null
  options: readonly SizeOption[]
  onChange: (value: string) => void
}) {
  const selected = options.find((option) => option.value === value)
  return (
    <Field>
      <Select value={value} onValueChange={(next) => onChange(String(next))}>
        <SelectTrigger aria-label="Standard size" className="w-full">
          <SelectValue>
            <span className="readout shrink-0">{selected?.value ?? 'Custom'}</span>
            <span className="truncate text-muted-foreground">{selected?.use ?? 'off the standard range'}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="readout w-16 shrink-0">{option.value}</span>
              <span className="text-muted-foreground">{option.use}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
