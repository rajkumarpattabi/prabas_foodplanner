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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * "18 Sep", or "Fri 18 Sep" with the weekday. Written out by hand: the browser's own
 * formatting differs between phones ("Sept" on some, "Sep" on others).
 */
export function formatDay(date: LocalDate, { weekday = false } = {}): string {
  const d = parseLocalDate(date)
  return `${weekday ? `${WEEKDAYS[d.getDay()]} ` : ''}${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000)
}
