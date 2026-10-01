// Leftovers as the Stock tab's "Ready to eat" shows them.

import { daysBetween, type LocalDate } from '../lib/dates.ts'
import type { Level } from '../stock/urgency.ts'
import type { Leftover } from './types.ts'

/** Uneaten leftovers stay listed this many days past their date, to be checked and cleared. */
export const SHOW_PAST_DAYS = 2

export interface LeftoverRow {
  leftover: Leftover
  /** Red: eat today, or past its date. Amber: eat by tomorrow. Green: later. */
  level: Level
  label: string
}

export function leftoverRows(leftovers: readonly Leftover[], today: LocalDate): LeftoverRow[] {
  return leftovers
    .filter((l) => l.eaten_at === null && daysBetween(l.expires_on, today) <= SHOW_PAST_DAYS)
    .map((l) => {
      const d = daysBetween(today, l.expires_on)
      const [level, label]: [Level, string] =
        d < 0 ? ['red', 'Past its date · check'] : d === 0 ? ['red', 'Eat today'] : d === 1 ? ['amber', 'Eat by tomorrow'] : ['green', `Good for ${d} days`]
      return { leftover: l, level, label }
    })
    .sort((a, b) => a.leftover.expires_on.localeCompare(b.leftover.expires_on) || a.leftover.name_en.localeCompare(b.leftover.name_en))
}
