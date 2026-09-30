// Form fields shared by the Add stock and item detail sheets.

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
