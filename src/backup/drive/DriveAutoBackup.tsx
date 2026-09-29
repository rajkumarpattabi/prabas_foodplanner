import { useEffect, useRef } from 'react'
import { useBackup } from '../useBackup.ts'
import { isBackupDue, readStatus } from './driveBackup.ts'
import { useDriveBackup } from './useDriveBackup.ts'

/**
 * On app open (MealFast's gdMaybeAutoBackup): if this is the backup owner's phone,
 * Drive is connected, and the last backup is over 24 hours old, back up quietly.
 */
export function DriveAutoBackup() {
  const { isBackupOwner } = useBackup()
  const { available, sync } = useDriveBackup()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !available || !isBackupOwner || !navigator.onLine) return
    if (!isBackupDue(readStatus())) return
    done.current = true
    void sync(false)
  }, [available, isBackupOwner, sync])

  return null
}
