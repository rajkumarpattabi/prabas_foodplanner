// Calendar dates as "YYYY-MM-DD" strings in the phone's local time. Expiry dates,
// file names, and "days left" all work in whole local days, not UTC instants.

export type LocalDate = string

export function localDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseLocalDate(s: LocalDate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(date)
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000)
}
