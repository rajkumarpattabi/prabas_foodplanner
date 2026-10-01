// The non-veg rhythm: twice a week. Sunday is preferred; the second day is midweek
// (Wednesday or Thursday), at least two days from the other. A target that falls on a
// restricted day moves to the nearest allowed day. During Puratasi it pauses, and the
// first allowed day after Puratasi is a non-veg day to mark the return.

import { addDays, daysBetween, parseLocalDate, type LocalDate } from '../lib/dates.ts'
import { covers, isRestricted } from './rules.ts'
import type { CalendarDay } from './types.ts'

export const RHYTHM = {
  /** Non-veg days are at least this many days apart. */
  minGapDays: 2,
  /** How far a target may move to find an allowed day. */
  maxShiftDays: 3,
} as const

export type TargetReason = 'sunday' | 'midweek' | 'return'

/** Days from Wednesday to try for the midweek day: Wednesday, Thursday, then nearest. */
const MIDWEEK_SHIFTS = [0, 1, -1, 2, -2]
/** Days from Sunday to try: Sunday, then nearest, later first (Saturday is always restricted). */
const SUNDAY_SHIFTS = [0, 1, -1, 2, -2, 3, -3]

/** Monday of the week the date is in. */
function mondayOf(date: LocalDate): LocalDate {
  const day = parseLocalDate(date).getDay() // 0 Sunday … 6 Saturday
  return addDays(date, -((day + 6) % 7))
}

/** The non-veg target days from `from` to `to` (inclusive), and why each is one. */
export function nonVegTargets(from: LocalDate, to: LocalDate, days: readonly CalendarDay[]): Map<LocalDate, TargetReason> {
  // Look a week either side, so spacing near the edges is right.
  const start = addDays(mondayOf(from), -7)
  const end = addDays(to, 7)
  const puratasi = days.filter((d) => d.type === 'puratasi')
  const inPuratasi = (date: LocalDate) => puratasi.some((p) => covers(p, date))
  const placed = new Map<LocalDate, TargetReason>()
  const free = (date: LocalDate) =>
    !isRestricted(date, days) && !inPuratasi(date) && [...placed.keys()].every((p) => Math.abs(daysBetween(p, date)) >= RHYTHM.minGapDays)

  const place = (ideal: LocalDate, shifts: readonly number[], reason: TargetReason) => {
    // Paused for Puratasi: a day that falls in it is skipped, not moved out of it.
    if (inPuratasi(ideal)) return
    // A return day within reach already counts as this one (not a third that week).
    const returned = [...placed].some(([d, r]) => r === 'return' && Math.abs(daysBetween(ideal, d)) <= Math.max(...shifts.map(Math.abs)))
    if (returned) return
    for (const s of shifts) {
      const d = addDays(ideal, s)
      if (Math.abs(s) <= RHYTHM.maxShiftDays && free(d)) {
        placed.set(d, reason)
        return
      }
    }
  }

  // 1. The day after each Puratasi: the first allowed day.
  for (const p of puratasi) {
    let d = addDays(p.end_date ?? p.date, 1)
    for (let i = 0; i < 7 && (isRestricted(d, days) || inPuratasi(d)); i++) d = addDays(d, 1)
    if (d >= start && d <= end && free(d)) placed.set(d, 'return')
  }
  const weeks: LocalDate[] = []
  for (let m = start; m <= end; m = addDays(m, 7)) weeks.push(m)
  // 2. Sundays, then 3. midweek days, each kept apart from what's already placed.
  for (const m of weeks) place(addDays(m, 6), SUNDAY_SHIFTS, 'sunday')
  for (const m of weeks) place(addDays(m, 2), MIDWEEK_SHIFTS, 'midweek')

  return new Map([...placed].filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b)))
}
