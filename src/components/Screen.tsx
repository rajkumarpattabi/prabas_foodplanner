import type { ReactNode } from 'react'

interface ScreenProps {
  title: string
  /** Optional control on the left of the title, such as a back link. */
  leading?: ReactNode
  /** Optional controls on the right of the title, such as the settings icon. */
  actions?: ReactNode
  children: ReactNode
}

/** Standard screen layout: a compact header, then scrolling content. */
export function Screen({ title, leading, actions, children }: ScreenProps) {
  return (
    <div className="mx-auto w-full max-w-xl px-4">
      <header className="flex min-h-14 items-center gap-2 pt-[env(safe-area-inset-top)]">
        {leading}
        <h1 className="flex-1 text-xl font-semibold">{title}</h1>
        {actions}
      </header>
      <div className="pb-6">{children}</div>
    </div>
  )
}

/** Friendly empty state for screens that later batches will fill in. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">
      {children}
    </p>
  )
}
