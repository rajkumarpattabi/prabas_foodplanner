// What the Calendar screen lists: restricted days by month, soonest first.

import type { LocalDate } from '../lib/dates.ts'
import type { CalendarDay } from './types.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface CalendarMonth {
  /** "2026-10" */
  key: string
  /** "October 2026" */
  title: string
  days: CalendarDay[]
}

/**
 * Entries that touch [from, to] (a Puratasi that started earlier still shows), grouped
 * by the month they start in, soonest first. Optionally only the ones still to check.
 */
export function calendarMonths(
  days: readonly CalendarDay[],
  from: LocalDate,
  to: LocalDate,
  { toCheckOnly = false } = {},
): CalendarMonth[] {
  const shown = days
    .filter((d) => (d.end_date ?? d.date) >= from && d.date <= to && (!toCheckOnly || !d.verified))
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type))
  const months = new Map<string, CalendarDay[]>()
  for (const d of shown) {
    const key = d.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), d])
  }
  return [...months].map(([key, list]) => ({ key, title: `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, days: list }))
}

/** How many still need checking, from `from` on. */
export const toCheckCount = (days: readonly CalendarDay[], from: LocalDate) =>
  days.filter((d) => !d.verified && (d.end_date ?? d.date) >= from).length
