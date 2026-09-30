import type { ReactNode } from 'react'
import { Sheet } from './Sheet.tsx'

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
  return (
    <Sheet title={title} role="alertdialog" onClose={onCancel} busy={busy}>
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
        <button data-autofocus type="button" onClick={onCancel} disabled={busy} className="min-h-12 rounded-xl font-medium">
          Cancel
        </button>
      </div>
    </Sheet>
  )
}
