// What a day means for meals: veg only (and why), a non-veg day, or neither.

import { addDays, type LocalDate } from '../lib/dates.ts'
import { nonVegTargets, type TargetReason } from './rhythm.ts'
import { restrictionsOn, type Restriction } from './rules.ts'
import type { CalendarDay } from './types.ts'

export interface DayContext {
  /** No non-veg at all today. */
  vegOnly: boolean
  /** A day in the non-veg rhythm: non-veg combos get a nudge. */
  nonVegDay: boolean
  /** "Saturday · veg only", "Amavasai (check date) · veg only", "Non-veg day", or none. */
  chip: string | null
  restrictions: Restriction[]
  target: TargetReason | null
}

export function dayContext(date: LocalDate, days: readonly CalendarDay[]): DayContext {
  const restrictions = restrictionsOn(date, days)
  if (restrictions.length) {
    const first = restrictions[0]
    return {
      vegOnly: true,
      nonVegDay: false,
      chip: `${first.label}${first.verified ? '' : ' (check date)'} · veg only`,
      restrictions,
      target: null,
    }
  }
  const target = nonVegTargets(addDays(date, -1), addDays(date, 1), days).get(date) ?? null
  return {
    vegOnly: false,
    nonVegDay: target !== null,
    chip: target === 'return' ? 'Non-veg day · Puratasi is over' : target ? 'Non-veg day' : null,
    restrictions,
    target,
  }
}
