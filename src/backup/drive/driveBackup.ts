// Drive backup, ported from MealFast's gdBackup / gdRestore / gdMaybeAutoBackup,
// with rolling dated files in a "PRABAS backups" folder instead of one overwritten file.

import { backupFileName, type Backup } from '../format.ts'
import { DriveError, type BackupFileInfo, type DriveFiles } from './driveFiles.ts'
import { GoogleAuthError, type TokenSource } from './google.ts'
import { backupDate, planRetention } from './retention.ts'

/** Device-local Drive state (the owner's phone only). */
export const GD = {
  connected: 'prabas_gd_connected',
  last: 'prabas_gd_last',
  folderId: 'prabas_gd_folderId',
  err: 'prabas_gd_err',
} as const

export const AUTO_BACKUP_AFTER_MS = 24 * 3_600_000

export const ERR_SIGN_IN = 'Sign-in needed to sync'
export const ERR_FAILED = 'Last sync failed · will retry'

export interface DriveDeps {
  tokens: TokenSource
  files: DriveFiles
}

export interface DriveStatus {
  connected: boolean
  last: string | null
  err: string | null
}

export function readStatus(): DriveStatus {
  return {
    connected: localStorage.getItem(GD.connected) === '1',
    last: localStorage.getItem(GD.last),
    err: localStorage.getItem(GD.err),
  }
}

export function isBackupDue(status: DriveStatus, now = Date.now()): boolean {
  if (!status.connected) return false
  const last = status.last ? new Date(status.last).getTime() : 0
  return now - last >= AUTO_BACKUP_AFTER_MS
}

/** Get a token and run `fn`; if Drive says the token expired, get a fresh one and retry once. */
async function withToken<T>(deps: DriveDeps, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await deps.tokens.getToken()
  try {
    return await fn(token)
  } catch (e) {
    if (!(e instanceof DriveError && e.status === 401)) throw e
    deps.tokens.forget()
    return fn(await deps.tokens.getToken())
  }
}

async function folder(deps: DriveDeps, token: string): Promise<string> {
  const id = await deps.files.ensureFolder(token, localStorage.getItem(GD.folderId))
  localStorage.setItem(GD.folderId, id)
  return id
}

/**
 * Saves today's backup (replacing today's file if there is one), then prunes old
 * files by the retention rule. Records success or a readable error in local storage,
 * keeping the last-known-good time when it fails. Resolves to the new status.
 */
export async function backupToDrive(deps: DriveDeps, makeBackup: () => Promise<Backup>, now = new Date()): Promise<DriveStatus> {
  try {
    await withToken(deps, async (token) => {
      const folderId = await folder(deps, token)
      const backup = await makeBackup()
      const existing = await deps.files.list(token, folderId)
      const name = backupFileName(now)
      await deps.files.save(token, folderId, name, JSON.stringify(backup), existing)

      const all = existing.some((f) => f.name === name) ? existing : [...existing, { id: '(new)', name, modifiedTime: '' }]
      for (const f of planRetention(all, now).remove) await deps.files.remove(token, f.id)
    })
    localStorage.setItem(GD.connected, '1')
    localStorage.setItem(GD.last, now.toISOString())
    localStorage.removeItem(GD.err)
  } catch (e) {
    localStorage.setItem(GD.err, e instanceof GoogleAuthError || isAuthStatus(e) ? ERR_SIGN_IN : ERR_FAILED)
  }
  return readStatus()
}

const isAuthStatus = (e: unknown) => e instanceof DriveError && (e.status === 401 || e.status === 403)

/** The backups on Drive, newest first. */
export async function listDriveBackups(deps: DriveDeps): Promise<BackupFileInfo[]> {
  const files = await withToken(deps, async (token) => deps.files.list(token, await folder(deps, token)))
  return files
    .filter((f) => backupDate(f.name))
    .sort((a, b) => b.name.localeCompare(a.name) || b.modifiedTime.localeCompare(a.modifiedTime))
}

export async function readDriveBackup(deps: DriveDeps, fileId: string): Promise<string> {
  return withToken(deps, (token) => deps.files.read(token, fileId))
}

/** Revoke Drive access first (docs: "Disconnect revokes access"), then clear local flags. */
export async function disconnectDrive(deps: DriveDeps): Promise<void> {
  try {
    await deps.tokens.revoke()
  } finally {
    Object.values(GD).forEach((k) => localStorage.removeItem(k))
  }
}
