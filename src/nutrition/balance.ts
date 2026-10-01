// How the last fortnight (or this week) went, group by group, and where the real gaps are.

import { nonVegTargets } from '../calendar/rhythm.ts'
import { inPuratasi } from '../calendar/rules.ts'
import type { CalendarDay } from '../calendar/types.ts'
import type { Dish, Meal } from '../dishes/types.ts'
import { addDays, daysBetween, parseLocalDate, type LocalDate } from '../lib/dates.ts'
import type { MealRecord } from '../plan/types.ts'
import type { Item } from '../stock/types.ts'
import { cover, GROUPS, type Group } from './groups.ts'

/** The fortnight the gaps are worked out over. */
export const WINDOW_DAYS = 14

/** What a fortnight should have. meals: meals with it; days: days with it; distinct: different vegetables. */
export const TARGETS: Readonly<Record<Group, { kind: 'meals' | 'days' | 'distinct'; target: number }>> = {
  legume: { kind: 'meals', target: 7 },
  protein: { kind: 'meals', target: 10 },
  greens: { kind: 'days', target: 4 },
  variety: { kind: 'distinct', target: 8 },
  millet: { kind: 'meals', target: 2 },
  fish: { kind: 'meals', target: 2 },
  curd: { kind: 'days', target: 5 },
}

export const BALANCE = {
  /** No gaps until there are this many cooked meals in the fortnight … */
  minMeals: 10,
  /** … the first of them at least this many days ago. */
  minDaysOfHistory: 7,
  /** Greens are short if there have been none for longer than this. */
  greensMaxGapDays: 5,
  /** Fish only counts in a fortnight with at least this many non-veg days. */
  fishMinNonVegDays: 3,
} as const

/** Legumes count double: the family's biggest gap. */
export const GROUP_WEIGHT: Readonly<Record<Group, number>> = { legume: 2, protein: 1, greens: 1, variety: 1, millet: 1, fish: 1, curd: 1 }

export interface CookedMeal {
  date: LocalDate
  meal: Meal
  groups: Set<Group>
  vegetables: Set<string>
}

/** Cooked meals with what each covered. A meal whose dishes have all been deleted covers nothing. */
export function cookedMeals(meals: readonly MealRecord[], dishesById: ReadonlyMap<string, Dish>, itemsById: ReadonlyMap<string, Pick<Item, 'category'>>): CookedMeal[] {
  return meals
    .filter((m) => m.status === 'cooked')
    .map((m) => {
      const c = cover(m.dish_ids.map((id) => dishesById.get(id)).filter((d): d is Dish => d !== undefined), itemsById)
      return { date: m.date, meal: m.meal, ...c }
    })
}

export interface GroupStat {
  group: Group
  /** Meals with it. */
  meals: number
  /** Days with it. */
  days: number
  /** Different vegetables (variety only). */
  distinct: number
  last: LocalDate | null
  /** The measure the target uses. */
  value: number
  /** The target for this period (scaled to its length). */
  target: number
  level: 'green' | 'amber' | 'red'
}

export interface Balance {
  from: LocalDate
  to: LocalDate
  /** Cooked meals in the period. */
  meals: number
  stats: Record<Group, GroupStat>
}

/** Each group from `from` to `to`, with targets scaled to the period's length. */
export function balance(cooked: readonly CookedMeal[], from: LocalDate, to: LocalDate): Balance {
  const inside = cooked.filter((m) => m.date >= from && m.date <= to)
  const scale = (daysBetween(from, to) + 1) / WINDOW_DAYS
  const stats = Object.fromEntries(
    GROUPS.map((g) => {
      const withIt = inside.filter((m) => m.groups.has(g))
      const days = new Set(withIt.map((m) => m.date)).size
      const distinct = new Set(inside.flatMap((m) => [...m.vegetables])).size
      const { kind, target: full } = TARGETS[g]
      const value = kind === 'meals' ? withIt.length : kind === 'days' ? days : distinct
      // Distinct vegetables don't scale down as neatly: a week still wants a good few.
      const target = Math.max(1, Math.round(kind === 'distinct' ? full * Math.max(scale, 0.75) : full * scale))
      const ratio = value / target
      const last = withIt.reduce<LocalDate | null>((l, m) => (l === null || m.date > l ? m.date : l), null)
      const stat: GroupStat = { group: g, meals: withIt.length, days, distinct, last, value, target, level: ratio >= 1 ? 'green' : ratio >= 0.5 ? 'amber' : 'red' }
      return [g, stat]
    }),
  ) as Record<Group, GroupStat>
  return { from, to, meals: inside.length, stats }
}

export interface Gap {
  group: Group
  /** 0 (just short) to 1 (none at all). */
  size: number
  /** Days since the group was last eaten, or null if not in the fortnight. */
  daysSince: number | null
}

export interface Nutrition {
  gaps: Gap[]
  /** Vegetables cooked in the fortnight: one not among them adds variety. */
  recentVegetables: Set<string>
  /** Enough cooking logged to judge (see BALANCE). */
  enough: boolean
}

/** The real gaps in the fortnight up to today, biggest (and weightiest) first. */
export function nutrition(cooked: readonly CookedMeal[], today: LocalDate, calendar: readonly CalendarDay[]): Nutrition {
  const from = addDays(today, -(WINDOW_DAYS - 1))
  const inside = cooked.filter((m) => m.date >= from && m.date <= today)
  const recentVegetables = new Set(inside.flatMap((m) => [...m.vegetables]))
  const earliest = inside.reduce<LocalDate | null>((e, m) => (e === null || m.date < e ? m.date : e), null)
  const enough = inside.length >= BALANCE.minMeals && earliest !== null && daysBetween(earliest, today) >= BALANCE.minDaysOfHistory
  if (!enough) return { gaps: [], recentVegetables, enough }

  const b = balance(cooked, from, today)
  const fishCounts = !inPuratasi(today, calendar) && nonVegTargets(from, today, calendar).size >= BALANCE.fishMinNonVegDays
  const gaps: Gap[] = []
  for (const g of GROUPS) {
    if (g === 'fish' && !fishCounts) continue
    const s = b.stats[g]
    const daysSince = s.last === null ? null : daysBetween(s.last, today)
    let size = Math.max(0, 1 - s.value / s.target)
    if (g === 'greens' && (daysSince === null || daysSince > BALANCE.greensMaxGapDays)) size = Math.max(size, 0.5)
    if (size > 0) gaps.push({ group: g, size, daysSince })
  }
  gaps.sort((a, b2) => b2.size * GROUP_WEIGHT[b2.group] - a.size * GROUP_WEIGHT[a.group])
  return { gaps, recentVegetables, enough }
}

/** Monday of the week the date is in. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -((parseLocalDate(date).getDay() + 6) % 7))
}
