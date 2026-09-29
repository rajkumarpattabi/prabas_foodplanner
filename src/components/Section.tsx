import type { ReactNode } from 'react'

/** A titled card on the Settings screen. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-muted">{title}</h2>
      {children}
    </section>
  )
}
