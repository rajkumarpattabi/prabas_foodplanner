import { useCallback } from 'react'
import { HouseholdError } from '../household/api.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { useSync } from '../offline/syncContext.ts'
import { useBackupApi } from './backupContext.ts'
import { buildBackup, type Backup } from './format.ts'
import { BACKED_UP_TABLES } from './tables.ts'

/** Making a snapshot and restoring one: shared by file backup and Drive backup. */
export function useBackup() {
  const api = useBackupApi()
  const { db } = useSync()
  const { me, household, reload } = useReadyHousehold()
  const isBackupOwner = household.backup_owner_id === me.user_id

  const makeBackup = useCallback(
    async (): Promise<Backup> => buildBackup(household.id, await api.fetchTables(household.id, BACKED_UP_TABLES)),
    [api, household.id],
  )

  /** Replace the household's data with a validated backup. Resolves to an error message, or null. */
  const restore = useCallback(
    async (backup: Backup): Promise<string | null> => {
      try {
        // Changes still waiting to be sent would land on top of the restored data.
        await db.outbox.where('userId').equals(me.user_id).delete()
        await api.restore(backup.tables)
        await reload()
        return null
      } catch (e) {
        return e instanceof HouseholdError ? e.message : 'Something went wrong. Try again.'
      }
    },
    [api, db, me.user_id, reload],
  )

  return { makeBackup, restore, isBackupOwner, householdId: household.id }
}
