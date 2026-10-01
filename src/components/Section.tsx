import { useId, type ReactNode } from 'react'

/** A titled card on the Settings screen, named by its title for screen readers. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <h2 id={id} className="mb-3 text-sm font-semibold text-ink-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}
