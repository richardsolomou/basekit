import { useState, type ReactNode } from 'react'

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-rule px-5 py-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="note">{title}</h2>
        {aside}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

/** Keeps the fiddly settings out of the way until they are wanted. */
export function Drawer({ title, children, summary }: { title: string; children: ReactNode; summary?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="border-t border-rule">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-baseline gap-2 px-5 py-3 text-left hover:bg-plate/60"
      >
        <span className={`readout text-xs transition-transform ${open ? 'rotate-90 text-measure' : 'text-dim'}`}>›</span>
        <span className="note">{title}</span>
        {summary && !open && <span className="readout ml-auto text-xs text-dim">{summary}</span>}
      </button>
      {open && <div className="space-y-3 px-5 pb-4">{children}</div>}
    </section>
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
  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-bone/85">{label}</span>
        <span className="readout text-xs text-measure">
          {value.toFixed(step < 0.1 ? 2 : 1)}
          <span className="text-dim">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} in ${unit}`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      />
    </div>
  )
}

interface ChoiceProps<T extends string | number> {
  label?: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Choice<T extends string | number>({ label, value, options, onChange }: ChoiceProps<T>) {
  return (
    <div>
      {label && <span className="mb-1.5 block text-sm text-bone/85">{label}</span>}
      <div className="flex flex-wrap gap-px bg-rule/60 p-px">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`flex-1 px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${
              option.value === value ? 'bg-measure/15 text-measure' : 'bg-plate text-dim hover:text-bone'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between text-sm text-bone/85"
    >
      {label}
      <span className={`h-3.5 w-7 border transition-colors ${checked ? 'border-measure bg-measure/25' : 'border-rule bg-plate'}`}>
        <span className={`block h-full w-1/2 transition-transform ${checked ? 'translate-x-full bg-measure' : 'bg-rule'}`} />
      </span>
    </button>
  )
}
