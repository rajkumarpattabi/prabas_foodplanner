// Which meal to plan next. The main moment of use is the night before, so after
// dinner time the next meal is tomorrow's breakfast.

import type { Meal } from '../dishes/types.ts'
import { addDays, localDate, type LocalDate } from '../lib/dates.ts'

/** Until this time of day (minutes after midnight), that meal is still to come. */
export const MEAL_CUTOFFS: Readonly<Record<Meal, number>> = {
  breakfast: 10 * 60 + 30,
  lunch: 15 * 60,
  dinner: 21 * 60,
}

export function nextMeal(now = new Date()): { date: LocalDate; meal: Meal } {
  const today = localDate(now)
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < MEAL_CUTOFFS.breakfast) return { date: today, meal: 'breakfast' }
  if (minutes < MEAL_CUTOFFS.lunch) return { date: today, meal: 'lunch' }
  if (minutes < MEAL_CUTOFFS.dinner) return { date: today, meal: 'dinner' }
  return { date: addDays(today, 1), meal: 'breakfast' }
}
