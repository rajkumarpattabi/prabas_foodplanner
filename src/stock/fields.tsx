// Form fields shared by the stock and dish sheets.

import { useId, type ReactNode } from 'react'
import { Segmented } from '../components/Segmented.tsx'
import { ENTRY_UNIT_LABELS, inputClass } from './labels.ts'
import type { EntryUnit } from './types.ts'

interface AmountFieldsProps {
  label?: string
  amount: string
  unit: EntryUnit
  units: EntryUnit[]
  onChange: (next: { amount: string; unit: EntryUnit }) => void
}

/** An amount, and a unit picker when there's more than one unit to choose from. */
export function AmountFields({ label = 'Amount', amount, unit, units, onChange }: AmountFieldsProps) {
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium">
          {label}
          {units.length === 1 ? ` (${ENTRY_UNIT_LABELS[unit]})` : ''}
        </span>
        <input
          data-autofocus
          inputMode="decimal"
          value={amount}
          onChange={(e) => onChange({ amount: e.target.value, unit })}
          onFocus={(e) => e.target.select()}
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {units.length > 1 && (
        <Segmented
          label="Unit"
          options={units.map((u) => ({ value: u, label: ENTRY_UNIT_LABELS[u] }))}
          value={unit}
          onChange={(u) => onChange({ amount, unit: u })}
        />
      )}
    </>
  )
}

/** A labelled text field, with an optional hint linked for screen readers. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  lang,
  inputMode,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  lang?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        lang={lang}
        inputMode={inputMode}
        maxLength={400}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${inputClass}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A labelled checkbox. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-leaf" />
      <span className="text-sm font-medium">{label}</span>
    </label>
  )
}

/** A chip that toggles on and off (filters, meals, tags). */
export function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-3 text-sm font-medium ${
        pressed ? 'border-leaf bg-leaf-fill text-leaf-strong' : 'border-line bg-surface text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}
