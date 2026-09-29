// The backup file: one JSON snapshot of all household tables (see docs/DRIVE_BACKUP.md).

export type Row = Record<string, unknown>

export interface Backup {
  app: 'PRABAS'
  schemaVersion: number
  exportedAt: string
  householdId: string
  tables: Record<string, Row[]>
}

/**
 * Bump when the backup's shape changes, and add a migration from the previous
 * version to MIGRATIONS, so older backups restore instead of being rejected.
 */
export const CURRENT_SCHEMA_VERSION = 1

/** MIGRATIONS[n] turns a version n backup into version n + 1. */
export type Migrations = Readonly<Record<number, (backup: Backup) => Backup>>
export const MIGRATIONS: Migrations = {}

export function buildBackup(householdId: string, tables: Record<string, Row[]>, now = new Date()): Backup {
  return { app: 'PRABAS', schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: now.toISOString(), householdId, tables }
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

/** Validates a backup file and migrates it to the current version. */
export function parseBackup(
  text: string,
  current = CURRENT_SCHEMA_VERSION,
  migrations: Migrations = MIGRATIONS,
): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: "Couldn't read that file." }
  }
  const b = data as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== 'PRABAS') {
    return { ok: false, error: 'Not a PRABAS backup.' }
  }
  if (!Number.isInteger(b.schemaVersion) || (b.schemaVersion as number) < 1) {
    return { ok: false, error: 'This backup is damaged: it has no version.' }
  }
  if ((b.schemaVersion as number) > current) {
    return { ok: false, error: 'This backup is from a newer version of PRABAS. Update the app, then try again.' }
  }
  if (!b.tables || typeof b.tables !== 'object' || Array.isArray(b.tables)) {
    return { ok: false, error: 'This backup is damaged: it has no data.' }
  }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows)) return { ok: false, error: `This backup is damaged: "${name}" isn't a list.` }
  }

  let backup = b as Backup
  for (let v = backup.schemaVersion; v < current; v++) {
    const step = migrations[v]
    if (!step) return { ok: false, error: `This backup can't be upgraded from version ${v}.` }
    backup = { ...step(backup), schemaVersion: v + 1 }
  }
  return { ok: true, backup }
}

/** prabas-backup-YYYY-MM-DD.json, using the device's local date. */
export function backupFileName(now = new Date()): string {
  return `prabas-backup-${localDate(now)}.json`
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
