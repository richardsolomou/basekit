import { RotateCcw } from 'lucide-react'
import { useId, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

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

interface DimensionProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  disabled?: boolean
  compact?: boolean
  compactLabel?: string
  defaultValue?: number
  onChange: (value: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const quantise = (value: number, step: number) => Math.round(value / step) * step

function ResetButton({ label, value, onReset }: { label: string; value: string; onReset: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Reset ${label} to ${value}`}
      title={`Reset to ${value}`}
      onClick={onReset}
      className="shrink-0 text-modified transition-colors hover:text-modified/80"
    >
      <RotateCcw className="size-3.5" />
    </button>
  )
}

function ResetSlot({ children }: { children?: ReactNode }) {
  return <span className="col-start-2 row-start-1 flex size-3.5 items-center justify-center">{children}</span>
}

const settingColumns = 'grid w-full grid-cols-[minmax(0,1fr)_0.875rem_7rem] items-center gap-2'
const settingLabel = 'col-start-1 row-start-1 w-full font-normal'

/**
 * A dimension: type an exact figure, or drag its label to scrub. Typing is the
 * point — a slider cannot land on 28.5 reliably, and these are millimetres
 * someone is going to print.
 */
export function Dimension({
  label,
  value,
  min,
  max,
  step,
  unit = 'mm',
  disabled,
  compact,
  compactLabel,
  defaultValue,
  onChange,
}: DimensionProps) {
  const id = useId()
  const [text, setText] = useState<string | undefined>()
  const format = (next: number) => (Number.isInteger(step) ? String(Math.round(next)) : next.toFixed(step < 0.1 ? 2 : 1))
  const formatted = format(value)
  const modified = defaultValue !== undefined && value !== defaultValue

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

  const change = (raw: string) => {
    setText(raw)
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(quantise(parsed, step))
  }

  const finish = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed)) onChange(clamp(quantise(parsed, step), min, max))
    setText(undefined)
  }

  return (
    <Field orientation={compactLabel ? undefined : 'horizontal'} data-disabled={disabled} className={compact ? 'min-w-0' : undefined}>
      <div className={compact ? 'contents' : settingColumns}>
        <FieldLabel
          htmlFor={id}
          onPointerDown={startScrub}
          className={
            compactLabel
              ? 'px-1 text-[0.625rem] tracking-wider text-muted-foreground uppercase'
              : compact
                ? 'sr-only'
                : `${settingLabel} col-span-2 cursor-ew-resize touch-none ${modified ? 'text-modified' : ''}`
          }
        >
          {compactLabel ?? label}
        </FieldLabel>
        {!compact && modified && (
          <ResetSlot>
            <ResetButton
              label={label}
              value={`${format(defaultValue)}${unit ? ` ${unit}` : ''}`}
              onReset={() => {
                setText(undefined)
                onChange(defaultValue)
              }}
            />
          </ResetSlot>
        )}
        <InputGroup className={compact ? 'w-full min-w-0' : 'w-28 shrink-0'}>
          <InputGroupInput
            id={id}
            type="number"
            inputMode="decimal"
            aria-label={`${label} in ${unit}`}
            value={text ?? formatted}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(event) => change(event.currentTarget.value)}
            onBlur={(event) => finish(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
            className="readout text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && (
            <InputGroupAddon align="inline-end">
              <InputGroupText className="text-xs">{unit}</InputGroupText>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>
    </Field>
  )
}

interface ChoiceProps<T extends string | number> {
  label: string
  value: T
  defaultValue?: T
  disabled?: boolean
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

/**
 * Inline choice. Values travel as strings because Select works in strings, and
 * are mapped back through the options so numbers survive the trip.
 */
export function Choice<T extends string | number>({ label, value, defaultValue, disabled, options, onChange }: ChoiceProps<T>) {
  const id = useId()
  if (options.length <= 1) return null
  const modified = defaultValue !== undefined && value !== defaultValue
  const defaultLabel = options.find((option) => option.value === defaultValue)?.label ?? String(defaultValue)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? String(value)
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <div className={settingColumns}>
        <FieldLabel htmlFor={id} className={`${settingLabel} col-span-2 ${modified ? 'text-modified' : ''}`}>
          {label}
        </FieldLabel>
        {modified && !disabled && (
          <ResetSlot>
            <ResetButton label={label} value={defaultLabel} onReset={() => onChange(defaultValue)} />
          </ResetSlot>
        )}
        <Select
          disabled={disabled}
          value={String(value)}
          onValueChange={(next) => {
            const picked = options.find((option) => String(option.value) === String(next))
            if (picked) onChange(picked.value)
          }}
        >
          <SelectTrigger id={id} aria-label={label} className="w-28">
            <SelectValue>
              <span className="readout truncate text-xs">{selectedLabel}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                <span className="readout text-xs">{option.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  )
}

export function CompactChoice<T extends string | number>({ label, value, options, onChange }: Omit<ChoiceProps<T>, 'defaultValue'>) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? String(value)
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        const picked = options.find((option) => String(option.value) === String(next))
        if (picked) onChange(picked.value)
      }}
    >
      <SelectTrigger aria-label={label} className="w-full min-w-0">
        <SelectValue>
          <span className="readout truncate text-xs">{selectedLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={String(option.value)} value={String(option.value)}>
            <span className="readout text-xs">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ToggleSetting({
  label,
  checked,
  defaultChecked,
  onChange,
}: {
  label: string
  checked: boolean
  defaultChecked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  const modified = checked !== defaultChecked
  return (
    <Field orientation="horizontal">
      <div className={settingColumns}>
        <FieldLabel htmlFor={id} className={`${settingLabel} col-span-2 ${modified ? 'text-modified' : ''}`}>
          {label}
        </FieldLabel>
        {modified && (
          <ResetSlot>
            <ResetButton label={label} value={defaultChecked ? 'on' : 'off'} onReset={() => onChange(defaultChecked)} />
          </ResetSlot>
        )}
        <div className="flex w-28 justify-start">
          <Switch id={id} checked={checked} onCheckedChange={onChange} className="ms-px" />
        </div>
      </div>
    </Field>
  )
}

export interface SizeOption {
  value: string
  label?: string
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
  label = 'Standard base size',
  compact = false,
}: {
  value: string | null
  options: readonly SizeOption[]
  onChange: (value: string) => void
  label?: string
  compact?: boolean
}) {
  const id = useId()
  const selected = options.find((option) => option.value === value)
  return (
    <Field orientation={compact ? undefined : 'horizontal'} className={compact ? 'min-w-0' : undefined}>
      <div className={compact ? 'contents' : settingColumns}>
        {!compact && (
          <FieldLabel htmlFor={id} className={`${settingLabel} col-span-2`}>
            Size
          </FieldLabel>
        )}
        <Select value={value} onValueChange={(next) => onChange(String(next))}>
          <SelectTrigger id={id} aria-label={label} className={compact ? 'w-full min-w-0' : 'w-28'}>
            <SelectValue>
              <span className="readout shrink-0">{selected?.label ?? selected?.value ?? 'Custom'}</span>
              <span className="truncate text-muted-foreground">{selected?.use ?? 'off the standard range'}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false} style={{ width: '20rem', maxWidth: 'calc(100vw - 2rem)' }}>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="readout shrink-0">{option.label ?? option.value}</span>
                <span className="text-muted-foreground">{option.use}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  )
}
