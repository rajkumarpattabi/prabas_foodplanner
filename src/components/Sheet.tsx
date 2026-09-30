import { useEffect, useId, useRef, type ReactNode } from 'react'

interface SheetProps {
  title: string
  children: ReactNode
  onClose: () => void
  /** alertdialog for confirmations; dialog for everything else. */
  role?: 'dialog' | 'alertdialog'
  /** While busy, the sheet can't be closed. */
  busy?: boolean
}

/**
 * A bottom sheet over the screen, within thumb reach. Escape or a tap outside closes it.
 * Focus moves to the first element marked `data-autofocus`, or the sheet itself.
 */
export function Sheet({ title, children, onClose, role = 'dialog', busy }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = panel.current
    ;(el?.querySelector<HTMLElement>('[data-autofocus]') ?? el)?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !busy && onClose()}>
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
