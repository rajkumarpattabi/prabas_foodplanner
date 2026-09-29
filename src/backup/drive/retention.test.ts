import { describe, expect, test } from 'vitest'
import { backupDate, planRetention, weekStart, type DriveFile } from './retention.ts'

const file = (date: string): DriveFile => ({ id: date, name: `prabas-backup-${date}.json` })
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** One backup a day for `days` days, ending on `last`. */
function daily(last: Date, days: number): DriveFile[] {
  return Array.from({ length: days }, (_, i) =>
    file(iso(new Date(last.getFullYear(), last.getMonth(), last.getDate() - i))),
  )
}

// Tuesday 29 September 2026. Its week starts Monday 28 September.
const today = new Date(2026, 8, 29)

describe('dates', () => {
  test('parse backup names, and nothing else', () => {
    expect(backupDate('prabas-backup-2026-09-29.json')).toEqual(new Date(2026, 8, 29))
    expect(backupDate('prabas-backup-2026-9-29.json')).toBeNull()
    expect(backupDate('notes.json')).toBeNull()
  })

  test('weeks start on Monday', () => {
    expect(weekStart(new Date(2026, 8, 29))).toEqual(new Date(2026, 8, 28))
    expect(weekStart(new Date(2026, 9, 4))).toEqual(new Date(2026, 8, 28)) // Sunday
  })
})

describe('planRetention', () => {
  test('fewer than 7 files: keep them all', () => {
    const files = daily(today, 5)
    expect(planRetention(files, today)).toEqual({ keep: files, remove: [] })
  })

  test('60 days of daily backups: 7 daily plus the newest of each of the 4 weeks before this one', () => {
    const { keep, remove } = planRetention(daily(today, 60), today)
    const kept = keep.map((f) => f.id).sort()
    expect(kept).toEqual(
      [
        // daily: 23 to 29 September
        '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
        // weekly, newest in each week: w-1 (21–27 Sep) is already kept daily
        '2026-09-20', // w-2: 14–20 Sep
        '2026-09-13', // w-3: 7–13 Sep
        '2026-09-06', // w-4: 31 Aug–6 Sep
      ].sort(),
    )
    expect(remove).toHaveLength(60 - kept.length)
  })

  test('gaps: a week with no backups keeps nothing extra, and old weeks still count their newest', () => {
    const files = [
      file('2026-09-29'),
      file('2026-09-02'), // w-4, oldest of two in that week
      file('2026-09-05'), // w-4, newest in that week
      file('2026-08-01'), // older than 4 weeks
    ]
    // Only 4 files, all within the 7 newest, so all are kept.
    expect(planRetention(files, today).remove).toEqual([])

    const many = [...daily(today, 7), ...files.slice(1)]
    const { remove } = planRetention(many, today)
    expect(remove.map((f) => f.id).sort()).toEqual(['2026-08-01', '2026-09-02'])
  })

  test('files with other names are never deleted', () => {
    const other = { id: 'x', name: 'my notes.json' }
    const { keep, remove } = planRetention([...daily(today, 40), other], today)
    expect(keep).toContain(other)
    expect(remove).not.toContain(other)
  })
})
