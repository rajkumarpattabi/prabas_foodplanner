// What's been cooked: per dish, when last and how often.

import { daysBetween, type LocalDate } from '../lib/dates.ts'
import type { MealRecord } from './types.ts'

export interface DishHistory {
  lastCooked: LocalDate | null
  timesCooked: number
}

/** From cooked meals only. Every dish in a meal counts, sides too. */
export function dishHistory(meals: readonly MealRecord[]): Map<string, DishHistory> {
  const out = new Map<string, DishHistory>()
  for (const m of meals) {
    if (m.status !== 'cooked') continue
    for (const id of new Set(m.dish_ids)) {
      const h = out.get(id) ?? { lastCooked: null, timesCooked: 0 }
      out.set(id, {
        lastCooked: h.lastCooked === null || m.date > h.lastCooked ? m.date : h.lastCooked,
        timesCooked: h.timesCooked + 1,
      })
    }
  }
  return out
}

/** Whole days since it was last cooked, or null if never. */
export function daysSince(lastCooked: LocalDate | null, today: LocalDate): number | null {
  return lastCooked === null ? null : daysBetween(lastCooked, today)
}

/** "Not cooked yet", "Cooked today", "Cooked yesterday", "Cooked 45 days ago". */
export function cookedNote(lastCooked: LocalDate | null, today: LocalDate): string {
  const d = daysSince(lastCooked, today)
  if (d === null) return 'Not cooked yet'
  if (d <= 0) return 'Cooked today'
  if (d === 1) return 'Cooked yesterday'
  return `Cooked ${d} days ago`
}
