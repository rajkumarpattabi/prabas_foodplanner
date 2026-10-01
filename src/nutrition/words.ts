// Words for the food balance: the Plan card's line, and each group's figure.

import { formatDay } from '../lib/dates.ts'
import type { Balance, GroupStat } from './balance.ts'

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "8 of 12 meals", "On 3 days · last Tue", "6 different". */
export function statText(s: GroupStat, b: Balance): string {
  if (s.group === 'variety') return `${s.distinct} different`
  const last = s.last ? ` · last ${formatDay(s.last, { weekday: true }).split(' ')[0]}` : ''
  if (s.group === 'greens' || s.group === 'curd') return `On ${plural(s.days, 'day', 'days')}${last}`
  return `${s.meals} of ${plural(b.meals, 'meal', 'meals')}`
}

/** The one-line summary for the bottom of Plan. */
export function summaryLine(week: Balance): string {
  if (!week.meals) return 'This week: nothing cooked yet'
  return `This week: protein in ${week.stats.protein.meals} of ${plural(week.meals, 'meal', 'meals')} · greens on ${plural(week.stats.greens.days, 'day', 'days')}`
}
