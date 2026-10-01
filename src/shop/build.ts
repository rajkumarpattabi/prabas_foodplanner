// Building the shopping list: what's running low, what planned meals and batches need
// that isn't in stock, what a likely meal would need, and what was added by hand.
// One line per item, in its most urgent section, with every reason it's there.

import { isRestricted } from '../calendar/rules.ts'
import type { CalendarDay } from '../calendar/types.ts'
import { MEAL_LABELS } from '../dishes/labels.ts'
import type { Dish, Ingredient, Meal } from '../dishes/types.ts'
import { addDays, formatDay, type LocalDate } from '../lib/dates.ts'
import type { Combo } from '../plan/combos.ts'
import { comboIngredients, comboPrepared } from '../plan/score.ts'
import { prepPlan } from '../prepared/plan.ts'
import type { Item } from '../stock/types.ts'
import type { Level } from '../stock/urgency.ts'
import type { StockRow } from '../stock/view.ts'
import { SECTIONS, type SectionKey, type ShoppingItem } from './types.ts'

export const SHOP = {
  /** Planned meals this many days ahead count, today included. */
  horizonDays: 3,
  /** "Might need" looks at this many unplanned meals at most. */
  maybeMeals: 3,
  /** A skipped line stays hidden this many days, today included. */
  skipDays: 3,
} as const

/** Meat, fish and egg: never listed as missing on a veg-only day or in Puratasi. */
const NON_VEG = new Set(['meat', 'fish', 'egg'])
/** In almost everything and rarely stocked item by item: only once tracked (as in scoring). */
const PANTRY = new Set(['spice', 'oil'])

export interface MealNeed {
  date: LocalDate
  meal: Meal
  combo: Combo
}

/** A batch whose ingredient stage is still to do: "For ragi koozh · soak Tue 9 pm". */
export interface BatchNeed {
  /** "ragi koozh · soak Tue 9 pm" */
  label: string
  date: LocalDate
  ingredients: Ingredient[]
}

export interface ShopInput {
  today: LocalDate
  rows: readonly StockRow[]
  trackedItemIds: ReadonlySet<string>
  /** Planned, not yet cooked, within the horizon. */
  planned: readonly MealNeed[]
  /** The top suggestion for unplanned meals within the horizon. */
  maybe: readonly MealNeed[]
  batches: readonly BatchNeed[]
  /** Prepared items with a batch ready or under way: their ingredients aren't needed again. */
  preparedCovered: ReadonlySet<string>
  dishesById: ReadonlyMap<string, Dish>
  shopping: readonly ShoppingItem[]
  calendar: readonly CalendarDay[]
  /** In the person's chosen script. */
  dishName: (dish: Pick<Dish, 'name_ta' | 'name_en'>) => string
  /** "you", "Amma". */
  personName: (userId: string | null) => string
}

export interface ShopLine {
  item: Item
  section: SectionKey
  /** Why it's here, most urgent first: "Out", "For sambar · today's lunch". */
  reasons: string[]
  /** How much is short, in the item's stored unit; null when it's just running low. */
  quantity: number | null
  level: Level
  /** The hand-added row this line ticks off, if any. */
  wantId: string | null
}

/** "today's lunch", "tomorrow's breakfast", "Sat dinner". */
export function mealWhen(date: LocalDate, meal: Meal, today: LocalDate): string {
  const m = MEAL_LABELS[meal].toLowerCase()
  if (date === today) return `today's ${m}`
  if (date === addDays(today, 1)) return `tomorrow's ${m}`
  return `${formatDay(date, { weekday: true }).split(' ')[0]} ${m}`
}

interface Need {
  quantity: number
  reasons: string[]
  /** The soonest date it's needed. */
  date: LocalDate
}

const rank = (s: SectionKey) => SECTIONS.indexOf(s)

export function buildShoppingList(input: ShopInput): ShopLine[] {
  const { today } = input
  const rowsById = new Map(input.rows.map((r) => [r.item.id, r]))
  const vegOnlyToday = isRestricted(today, input.calendar)
  const nonVegBlocked = (item: Item, date: LocalDate) => NON_VEG.has(item.category) && (vegOnlyToday || isRestricted(date, input.calendar))

  /** Needs from meals and batches, per item, with each reason. */
  const collect = (meals: readonly MealNeed[], batches: readonly BatchNeed[], maybe: boolean) => {
    const needs = new Map<string, Need>()
    const add = (ing: Ingredient, reason: string, date: LocalDate) => {
      const row = rowsById.get(ing.item_id)
      if (!row || ing.optional) return
      if (PANTRY.has(row.item.category) && !input.trackedItemIds.has(row.item.id)) return
      if (nonVegBlocked(row.item, date)) return
      const n = needs.get(ing.item_id)
      if (n) {
        n.quantity += ing.quantity
        if (!n.reasons.includes(reason)) n.reasons.push(reason)
        if (date < n.date) n.date = date
      } else needs.set(ing.item_id, { quantity: ing.quantity, reasons: [reason], date })
    }
    for (const m of meals) {
      const when = mealWhen(m.date, m.meal, today)
      const main = input.dishName(m.combo.main)
      const tail = maybe ? `if you cook it ${when}` : when
      const reason = `For ${main} · ${tail}`
      for (const ing of comboIngredients(m.combo)) add(ing, reason, m.date)
      // Batter or dough with no batch ready or under way: its ingredients are needed too.
      for (const use of comboPrepared(m.combo)) {
        if (input.preparedCovered.has(use.dish_id)) continue
        const dish = input.dishesById.get(use.dish_id)
        const plan = dish ? prepPlan(dish) : null
        if (!plan) continue
        for (const ing of plan.ingredients) add(ing, `For ${input.dishName(dish!)}, for ${main} · ${tail}`, m.date)
      }
    }
    for (const b of batches) for (const ing of b.ingredients) add(ing, `For ${b.label}`, b.date)
    return needs
  }

  const have = (id: string) => rowsById.get(id)?.stock.total ?? 0
  const lines = new Map<string, ShopLine>()
  const put = (item: Item, section: SectionKey, reason: string | string[], quantity: number | null, level: Level) => {
    const reasons = Array.isArray(reason) ? reason : [reason]
    const line = lines.get(item.id)
    if (!line) {
      lines.set(item.id, { item, section, reasons: [...reasons], quantity, level, wantId: null })
      return
    }
    for (const r of reasons) if (!line.reasons.includes(r)) line.reasons.push(r)
    if (rank(section) < rank(line.section)) {
      line.section = section
      line.level = level
    }
    if (quantity !== null) line.quantity = (line.quantity ?? 0) + quantity
  }

  // Running low: the Stock screen's own rule.
  for (const r of input.rows) {
    if (r.urgency.group !== 'running_low' || nonVegBlocked(r.item, today)) continue
    put(r.item, 'low', r.urgency.label, null, r.urgency.level)
  }

  // Planned meals and batches: what's short after stock.
  const planned = collect(input.planned, input.batches, false)
  const plannedShort = new Map<string, number>()
  for (const [id, n] of planned) {
    const short = n.quantity - have(id)
    if (short <= 1e-9) continue
    plannedShort.set(id, short)
    const level: Level = n.date <= today ? 'red' : n.date === addDays(today, 1) ? 'amber' : 'green'
    put(rowsById.get(id)!.item, 'planned', n.reasons, short, level)
  }

  // Might need: what a likely meal would need beyond the planned ones.
  for (const [id, n] of collect(input.maybe, [], true)) {
    const short = (planned.get(id)?.quantity ?? 0) + n.quantity - have(id) - (plannedShort.get(id) ?? 0)
    if (short <= 1e-9) continue
    put(rowsById.get(id)!.item, 'maybe', n.reasons, short, 'green')
  }

  // Skipped lines stay hidden, unless a more urgent reason has come up since.
  for (const s of input.shopping) {
    if (s.kind !== 'skip' || !s.skip_until || s.skip_until < today) continue
    const line = lines.get(s.item_id)
    if (line && (s.section === null || rank(line.section) >= rank(s.section))) lines.delete(s.item_id)
  }

  // Added by hand: joins its line if there is one, ticked off with it.
  for (const s of input.shopping) {
    if (s.kind !== 'want' || s.done_at) continue
    const row = rowsById.get(s.item_id)
    if (!row) continue
    const by = `Added by ${input.personName(s.created_by)}`
    const line = lines.get(s.item_id)
    if (line) {
      line.reasons.push(by)
      line.wantId = s.id
      if (line.quantity === null && s.quantity !== null) line.quantity = s.quantity
    } else {
      lines.set(s.item_id, { item: row.item, section: 'added', reasons: [by], quantity: s.quantity, level: 'green', wantId: s.id })
    }
  }

  const levelOrder: Record<Level, number> = { red: 0, amber: 1, green: 2 }
  return [...lines.values()].sort(
    (a, b) => rank(a.section) - rank(b.section) || levelOrder[a.level] - levelOrder[b.level] || a.item.name_en.localeCompare(b.item.name_en),
  )
}

/** Today or tomorrow is a non-veg day with no non-veg meal planned: time to buy fish or meat. */
export interface NonVegNudge {
  date: LocalDate
  /** "Today", "Tomorrow" */
  day: string
  /** Meat and fish to offer, most often bought first. */
  items: Item[]
}

/** How many meat and fish items the nudge offers. */
export const NUDGE_ITEMS = 4

export function nonVegNudges({
  today,
  targets,
  plannedNonVegDates,
  rows,
}: {
  today: LocalDate
  /** Non-veg target days (see nonVegTargets) covering today and tomorrow. */
  targets: ReadonlySet<LocalDate>
  plannedNonVegDates: ReadonlySet<LocalDate>
  rows: readonly StockRow[]
}): NonVegNudge[] {
  const bought = (r: StockRow) => r.events.filter((e) => e.kind === 'delta' && e.quantity > 0).length
  const items = rows
    .filter((r) => r.item.category === 'meat' || r.item.category === 'fish')
    .sort((a, b) => bought(b) - bought(a) || a.item.name_en.localeCompare(b.item.name_en))
    .slice(0, NUDGE_ITEMS)
    .map((r) => r.item)
  if (!items.length) return []
  return [today, addDays(today, 1)]
    .filter((d) => targets.has(d) && !plannedNonVegDates.has(d))
    .map((date) => ({ date, day: date === today ? 'Today' : 'Tomorrow', items }))
}
