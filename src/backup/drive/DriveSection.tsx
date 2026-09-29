import { useState } from 'react'
import { useToast } from '../../components/toastContext.ts'
import { useReadyHousehold } from '../../household/householdContext.ts'
import { relTime } from '../../lib/time.ts'
import { parseBackup, type Backup } from '../format.ts'
import { RestoreConfirm } from '../RestoreConfirm.tsx'
import { useBackup } from '../useBackup.ts'
import { DriveError, type BackupFileInfo } from './driveFiles.ts'
import { useDriveStatus } from './driveContext.ts'
import { backupDate } from './retention.ts'
import { useDriveBackup } from './useDriveBackup.ts'

const button = 'min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-60'
const primary = 'min-h-11 rounded-xl bg-leaf px-4 text-sm font-semibold text-surface disabled:opacity-60'

const dayLabel = (f: BackupFileInfo) =>
  backupDate(f.name)?.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) ?? f.name

/** Google Drive backup. Controls for the backup owner; everyone else sees when it last ran. */
export function DriveSection() {
  const { household, members } = useReadyHousehold()
  const { isBackupOwner, restore, householdId } = useBackup()
  const drive = useDriveBackup()
  const status = useDriveStatus()
  const toast = useToast()
  const [busy, setBusy] = useState<'sync' | 'list' | 'read' | 'restore' | 'disconnect' | null>(null)
  const [choices, setChoices] = useState<BackupFileInfo[] | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)

  const shared = household.drive_backup_at ? `Backed up to Drive ${relTime(household.drive_backup_at)}` : 'Not backed up to Drive yet'

  if (!isBackupOwner) {
    const owner = members.find((m) => m.userId === household.backup_owner_id)?.profile?.display_name
    return (
      <div className="mt-4">
        <h3 className="text-sm text-ink-muted">Google Drive</h3>
        <p className="mt-1 text-sm">{shared}</p>
        <p className="mt-1 text-xs text-ink-muted">Drive backup runs from {owner ? `${owner}'s` : "the backup owner's"} phone.</p>
      </div>
    )
  }

  if (!drive.available) {
    return (
      <div className="mt-4">
        <h3 className="text-sm text-ink-muted">Google Drive</h3>
        <p className="mt-1 text-sm">Drive backup isn't set up in this build yet.</p>
      </div>
    )
  }

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(kind)
    try {
      return await fn()
    } finally {
      setBusy(null)
    }
  }

  async function openRestore() {
    try {
      const files = await run('list', drive.list)
      if (files && files.length === 0) toast('No backups on Drive yet')
      else if (files) setChoices(files)
    } catch {
      toast("Couldn't reach Drive. Try again.")
    }
  }

  async function pick(file: BackupFileInfo) {
    try {
      const text = await run('read', () => drive.read(file.id))
      if (text === undefined) return
      const result = parseBackup(text)
      if (!result.ok) {
        toast(result.error)
        return
      }
      setChoices(null)
      setPending(result.backup)
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) {
        toast('That backup is no longer on Drive. Pick another.')
        void openRestore()
      } else {
        toast("Couldn't read that backup. Try again.")
      }
    }
  }

  async function confirmRestore() {
    if (!pending) return
    const err = await run('restore', () => restore(pending))
    setPending(null)
    toast(err ?? 'Restored from Drive')
  }

  const errLine = status.err && (
    <p className="mt-2 flex items-center gap-2 text-sm text-red">
      <span aria-hidden="true">!</span>
      {status.err}
    </p>
  )

  return (
    <div className="mt-4">
      <h3 className="text-sm text-ink-muted">Google Drive</h3>
      {!status.connected ? (
        <>
          <p className="mt-1 text-sm">Keeps a week of daily backups and a month of weekly ones in your Drive.</p>
          <button type="button" className={`${primary} mt-2`} disabled={busy !== null} onClick={() => void run('sync', () => drive.sync(true))}>
            {busy === 'sync' ? 'Connecting…' : 'Connect Google Drive'}
          </button>
          {errLine}
        </>
      ) : (
        <>
          <p className="mt-1 text-sm">{status.last ? `Last synced: ${relTime(status.last)}` : 'Connected · not synced yet'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy !== null} onClick={() => void run('sync', () => drive.sync(true))}>
              {busy === 'sync' ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className={button} disabled={busy !== null} onClick={() => void openRestore()}>
              {busy === 'list' ? 'Loading…' : 'Restore from Drive'}
            </button>
          </div>
          {errLine}
          <button
            type="button"
            className="mt-2 min-h-11 text-sm text-ink-muted underline"
            disabled={busy !== null}
            onClick={() => void run('disconnect', drive.disconnect)}
          >
            Disconnect Drive
          </button>
        </>
      )}

      {choices && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => busy === null && setChoices(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drive-pick-title"
            className="max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="drive-pick-title" className="text-lg font-semibold">
              Restore from Drive
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Pick a backup. Newest first.</p>
            <ul className="mt-3 divide-y divide-line">
              {choices.map((f, i) => (
                <li key={f.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void pick(f)}
                    className="flex min-h-12 w-full items-center justify-between py-2 text-left disabled:opacity-60"
                  >
                    <span>{dayLabel(f)}</span>
                    {i === 0 && <span className="rounded-full bg-leaf-fill px-2 py-0.5 text-xs font-medium text-leaf-strong">Latest</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-4 min-h-12 w-full rounded-xl font-medium" onClick={() => setChoices(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {pending && (
        <RestoreConfirm
          backup={pending}
          currentHouseholdId={householdId}
          busy={busy === 'restore'}
          onConfirm={() => void confirmRestore()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
