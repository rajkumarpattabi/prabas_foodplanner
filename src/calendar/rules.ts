// The family's food rules: no non-veg (meat, fish or egg) on Amavasai, Kiruthigai,
// any Saturday, the whole of Puratasi, or family days.

import { parseLocalDate, type LocalDate } from '../lib/dates.ts'
import { TYPE_NAMES, type CalendarDay, type CalendarType } from './types.ts'

export type RestrictionKind = 'saturday' | CalendarType

export interface Restriction {
  kind: RestrictionKind
  label: string
  verified: boolean
  /** The calendar entry, or none for the Saturday rule. */
  entry: CalendarDay | null
}

export const isSaturday = (date: LocalDate) => parseLocalDate(date).getDay() === 6

/** Does this entry cover the date? Puratasi covers its whole stretch. */
export const covers = (entry: CalendarDay, date: LocalDate) => entry.date <= date && date <= (entry.end_date ?? entry.date)

/** Most telling first: Puratasi, then Amavasai, Kiruthigai, family days, and Saturday last. */
const ORDER: Record<RestrictionKind, number> = { puratasi: 0, amavasai: 1, kiruthigai: 2, family_custom: 3, saturday: 4 }

/** Every reason this date is veg-only, most telling first. */
export function restrictionsOn(date: LocalDate, days: readonly CalendarDay[]): Restriction[] {
  const out: Restriction[] = days
    .filter((d) => covers(d, date))
    .map((d) => ({ kind: d.type, label: d.label.trim() || TYPE_NAMES[d.type], verified: d.verified, entry: d }))
  if (isSaturday(date)) out.push({ kind: 'saturday', label: 'Saturday', verified: true, entry: null })
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

export const isRestricted = (date: LocalDate, days: readonly CalendarDay[]) => restrictionsOn(date, days).length > 0

export const inPuratasi = (date: LocalDate, days: readonly CalendarDay[]) => days.some((d) => d.type === 'puratasi' && covers(d, date))
