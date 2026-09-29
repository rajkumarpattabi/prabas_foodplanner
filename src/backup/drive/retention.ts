// Rolling Drive backups: a bad day's data can never overwrite the only good copy.
//
// Keep:  the 7 newest daily files, and
//        the newest file from each of the 4 calendar weeks (Monday start) before this week.
// Delete everything else. Files whose names don't parse are never deleted.

export const DAILY_KEEP = 7
export const WEEKS_KEEP = 4

export interface DriveFile {
  id: string
  name: string
}

const NAME = /^prabas-backup-(\d{4})-(\d{2})-(\d{2})\.json$/

/** The local date in a backup file name, as a Date at local midnight; null if it isn't one. */
export function backupDate(name: string): Date | null {
  const m = NAME.exec(name)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Monday 00:00 of the week containing `d` (local time). */
export function weekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7 // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
}

export function planRetention(files: readonly DriveFile[], today: Date): { keep: DriveFile[]; remove: DriveFile[] } {
  const dated = files
    .map((f) => ({ f, date: backupDate(f.name) }))
    .filter((x): x is { f: DriveFile; date: Date } => x.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  const keep = new Set<DriveFile>(files.filter((f) => backupDate(f.name) === null))
  dated.slice(0, DAILY_KEEP).forEach((x) => keep.add(x.f))

  const thisWeek = weekStart(today)
  for (let w = 1; w <= WEEKS_KEEP; w++) {
    const start = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - 7 * w)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    const newestInWeek = dated.find((x) => x.date >= start && x.date < end)
    if (newestInWeek) keep.add(newestInWeek.f)
  }

  return { keep: files.filter((f) => keep.has(f)), remove: files.filter((f) => !keep.has(f)) }
}
