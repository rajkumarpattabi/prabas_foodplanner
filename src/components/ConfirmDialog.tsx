import { useEffect, useRef, type ReactNode } from 'react'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}

/**
 * A bottom sheet asking to confirm. Used only where the design calls for it
 * (restoring a backup, deleting a dish); everything else applies with Undo.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-xl rounded-t-3xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 space-y-2 text-sm text-ink-muted">{children}</div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-12 rounded-xl bg-red font-semibold text-surface disabled:opacity-60"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="min-h-12 rounded-xl font-medium">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
