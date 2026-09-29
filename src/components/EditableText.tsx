import { useState } from 'react'

interface EditableTextProps {
  id: string
  label: string
  value: string
  maxLength: number
  /** Called with the trimmed new value, only when it changed and isn't empty. */
  onCommit: (value: string) => void
}

/**
 * A text field that saves when you leave it or press Enter; Escape puts it back.
 * While not being edited it shows the current value, so changes from the other phone appear.
 */
export function EditableText({ id, label, value, maxLength, onCommit }: EditableTextProps) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    const next = draft?.trim()
    if (next && next !== value) onCommit(next)
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={draft ?? value}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
          }
        }}
        className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
      />
    </div>
  )
}
