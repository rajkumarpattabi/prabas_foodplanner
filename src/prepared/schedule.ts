// Planning a batch backwards from when it's wanted: "koozh for Thursday breakfast"
// means soak on Tuesday night and cook on Wednesday morning.

import type { Meal } from '../dishes/types.ts'
import { parseLocalDate, type LocalDate } from '../lib/dates.ts'
import { totalHours } from './plan.ts'
import type { PrepStage } from './types.ts'

const HOUR = 3_600_000
const MINUTE = 60_000

/** When each meal is eaten, in minutes after midnight. */
export const MEAL_TIMES: Readonly<Record<Meal, number>> = {
  breakfast: 7 * 60,
  lunch: 12 * 60 + 30,
  dinner: 19 * 60 + 30,
}

/** Nobody soaks or grinds between these times; such a step moves to the evening before. */
export const NIGHT = { from: 22 * 60, to: 6 * 60 } as const
/** Where a step that would fall at night goes instead. */
export const EVENING = 21 * 60

export function mealTime(date: LocalDate, meal: Meal): Date {
  const d = parseLocalDate(date)
  return new Date(d.getTime() + MEAL_TIMES[meal] * MINUTE)
}

/** Hours from the first stage's start to each stage's start. */
export function stageOffsets(stages: readonly PrepStage[]): number[] {
  let h = 0
  return stages.map((s) => {
    const at = h
    h += s.hours
    return at
  })
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes()
const atNight = (d: Date) => minutesOf(d) >= NIGHT.from || minutesOf(d) < NIGHT.to

/** 21:00 on the evening before a night-time moment (the same evening if it's before midnight). */
function eveningBefore(d: Date): Date {
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0)
  if (minutesOf(d) < NIGHT.to) e.setDate(e.getDate() - 1)
  return new Date(e.getTime() + EVENING * MINUTE)
}

export interface Schedule {
  /** When the first stage is due. */
  start: Date
  readyAt: Date
  /** It can't be ready in time: it starts now and is ready later than asked. */
  tooLate: boolean
}

/**
 * The latest start that has it ready by `readyBy` with no step to do at night. It may
 * be ready a little early: that's better than grinding at midnight.
 */
export function planBackwards(stages: readonly PrepStage[], readyBy: Date, now: Date): Schedule {
  const total = totalHours(stages) * HOUR
  const offsets = stageOffsets(stages)
  const naive = new Date(readyBy.getTime() - total)
  let start = naive
  for (let round = 0; round <= stages.length; round++) {
    const night = stages.map((s, i) => ({ s, at: new Date(start.getTime() + offsets[i] * HOUR) })).find(({ s, at }) => s.action && atNight(at))
    if (!night) break
    start = new Date(start.getTime() - (night.at.getTime() - eveningBefore(night.at).getTime()))
  }
  if (start.getTime() < now.getTime()) start = naive.getTime() >= now.getTime() ? naive : now
  const readyAt = new Date(start.getTime() + total)
  return { start, readyAt, tooLate: readyAt.getTime() > readyBy.getTime() }
}

/** These stages, with the adjustable one (ferment) taking `hours` instead. */
export function withHours(stages: readonly PrepStage[], hours: number): PrepStage[] {
  return stages.map((s) => (s.adjustable ? { ...s, hours } : { ...s }))
}
