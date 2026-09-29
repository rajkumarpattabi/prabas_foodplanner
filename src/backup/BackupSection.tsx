import { useRef, useState, type ChangeEvent } from 'react'
import { Section } from '../components/Section.tsx'
import { useToast } from '../components/toastContext.ts'
import { HouseholdError } from '../household/api.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { backupToCsv } from './csv.ts'
import { triggerDownload } from './download.ts'
import { backupFileName, localDate, parseBackup, type Backup } from './format.ts'
import { RestoreConfirm } from './RestoreConfirm.tsx'
import { CSV_SECTIONS } from './tables.ts'
import { useBackup } from './useBackup.ts'

const button = 'min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-60'

export function BackupSection() {
  const toast = useToast()
  const { members, household } = useReadyHousehold()
  const { makeBackup, restore, isBackupOwner, householdId } = useBackup()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'json' | 'csv' | 'restore' | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)

  const owner = members.find((m) => m.userId === household.backup_owner_id)?.profile?.display_name

  async function exportFile(kind: 'json' | 'csv') {
    setBusy(kind)
    try {
      const backup = await makeBackup()
      if (kind === 'json') {
        triggerDownload(JSON.stringify(backup, null, 2), 'application/json', backupFileName())
      } else {
        triggerDownload(backupToCsv(backup, CSV_SECTIONS), 'text/csv;charset=utf-8', `prabas-${localDate(new Date())}.csv`)
      }
      toast(kind === 'json' ? 'Backup saved' : 'CSV saved')
    } catch (e) {
      toast(e instanceof HouseholdError ? e.message : "Couldn't make the backup. Try again.")
    } finally {
      setBusy(null)
    }
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // Allow choosing the same file again later.
    if (!file) return
    const result = parseBackup(await file.text())
    if (result.ok) setPending(result.backup)
    else toast(result.error)
  }

  async function confirmRestore() {
    if (!pending) return
    setBusy('restore')
    const err = await restore(pending)
    setBusy(null)
    setPending(null)
    toast(err ?? 'Backup restored')
  }

  return (
    <Section title="Backup">
      <p className="text-sm text-ink-muted">Save a copy of the household's data to your phone.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy !== null} onClick={() => void exportFile('json')}>
          {busy === 'json' ? 'Saving…' : 'Export backup (JSON)'}
        </button>
        <button type="button" className={button} disabled={busy !== null} onClick={() => void exportFile('csv')}>
          {busy === 'csv' ? 'Saving…' : 'Export spreadsheet (CSV)'}
        </button>
      </div>

      <h3 className="mt-4 text-sm text-ink-muted">Restore</h3>
      {isBackupOwner ? (
        <>
          <button type="button" className={`${button} mt-2`} disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            Restore from file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => void pickFile(e)}
          />
        </>
      ) : (
        <p className="mt-1 text-sm">Only the backup owner{owner ? ` (${owner})` : ''} can restore.</p>
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
    </Section>
  )
}
