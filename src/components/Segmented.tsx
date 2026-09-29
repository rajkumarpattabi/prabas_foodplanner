interface SegmentedProps<T extends string> {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

/** A row of mutually exclusive choices, like a radio group. */
export function Segmented<T extends string>({ label, options, value, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-lg text-sm font-medium ${
            o.value === value ? 'bg-leaf-fill text-leaf-strong shadow-sm' : 'text-ink-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
