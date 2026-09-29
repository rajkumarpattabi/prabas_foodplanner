import { useCallback } from 'react'
import { useToast } from '../../components/toastContext.ts'
import { useReadyHousehold } from '../../household/householdContext.ts'
import { useBackup } from '../useBackup.ts'
import { backupToDrive, disconnectDrive, ERR_SIGN_IN, listDriveBackups, readDriveBackup } from './driveBackup.ts'
import { notifyDriveStatus, useDriveDeps } from './driveContext.ts'

// One Drive backup at a time, across the auto-backup and the Sync now button.
let running: Promise<void> | null = null

export function useDriveBackup() {
  const deps = useDriveDeps()
  const toast = useToast()
  const { makeBackup } = useBackup()
  const { recordDriveBackup } = useReadyHousehold()

  /** interactive: from a button tap, so show toasts. Otherwise quiet (auto-backup on open). */
  const sync = useCallback(
    (interactive: boolean): Promise<void> => {
      if (!deps) return Promise.resolve()
      running ??= (async () => {
        try {
          const status = await backupToDrive(deps, makeBackup)
          notifyDriveStatus()
          if (!status.err && status.last) recordDriveBackup(status.last)
          if (interactive) {
            toast(status.err ? (status.err === ERR_SIGN_IN ? "Google sign-in didn't finish. Try again." : 'Drive backup failed') : 'Backed up to Drive')
          }
        } finally {
          running = null
        }
      })()
      return running
    },
    [deps, makeBackup, recordDriveBackup, toast],
  )

  const list = useCallback(() => (deps ? listDriveBackups(deps) : Promise.resolve([])), [deps])
  const read = useCallback((fileId: string) => (deps ? readDriveBackup(deps, fileId) : Promise.reject(new Error('no Drive'))), [deps])

  const disconnect = useCallback(async () => {
    if (!deps) return
    await disconnectDrive(deps)
    notifyDriveStatus()
    toast('Drive disconnected')
  }, [deps, toast])

  return { available: deps !== null, sync, list, read, disconnect }
}
