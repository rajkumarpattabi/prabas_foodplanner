import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import type { Backup } from './format.ts'

interface Props {
  backup: Backup
  currentHouseholdId: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })

/** The one confirm before a restore, from a file or from Drive. */
export function RestoreConfirm({ backup, currentHouseholdId, busy, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog title="Restore this backup?" confirmLabel="Replace data" busy={busy} onConfirm={onConfirm} onCancel={onCancel}>
      <p>Backup from {when(backup.exportedAt)}.</p>
      <p className="font-medium text-ink">
        This replaces the household's data for everyone in the household, on every phone.
      </p>
      {backup.householdId !== currentHouseholdId && (
        <p className="rounded-lg bg-turmeric-fill px-3 py-2 text-turmeric-strong">
          This backup is from a different household. Its data will be restored into this one.
        </p>
      )}
    </ConfirmDialog>
  )
}
