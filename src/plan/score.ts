// Ranking combos for the next meal. One pure function with named weights; the "why"
// line on each card comes from its largest factors.

import type { Dish } from '../dishes/types.ts'
import type { Item } from '../stock/types.ts'
import type { LocalDate } from '../lib/dates.ts'
import { comboIsNonVeg, type Combo } from './combos.ts'
import { cookedNote, daysSince, type DishHistory } from './history.ts'

/**
 * How much each factor counts. Each factor's raw value is 0 to 1, so these are the
 * most each can add. nutrition (Batch 9) joins later.
 */
export const WEIGHTS = {
  /** Uses items that need using today or soon: using food before it spoils comes first. */
  nearExpiry: 4,
  /** Share of the needed ingredients that are in stock. */
  inStock: 2,
  favourite: 2,
  kidsFavourite: 1.5,
  /** Rises with days since the main was last cooked, up to a month. */
  daysSinceCooked: 2,
  /** Cooked in the last couple of days: not again so soon. */
  recentlyCooked: -6,
  /** Finishes a leftover. */
  leftover: 4,
  /** A non-veg combo on a non-veg day (Sunday and midweek, around the restricted days). */
  calendar: 3,
  nutrition: 0,
} as const

export type Factor = keyof typeof WEIGHTS

export const SCORING = {
  /** Days that count as "cooked recently". */
  recentDays: 2,
  /** Days since cooking at which daysSinceCooked is full. */
  fullAfterDays: 30,
  /** A dish never cooked counts as this many days. */
  neverCookedDays: 14,
  /** One soon-to-spoil item counts this share of nearExpiry; two or more count in full. */
  nearExpiryOne: 0.75,
  /** A factor needs to add at least this much to be named in the why line. */
  whyThreshold: 0.6,
} as const

export interface PlanContext {
  today: LocalDate
  itemsById: ReadonlyMap<string, Item>
  /** How much of each item is in stock, in its stored unit. */
  stockTotals: ReadonlyMap<string, number>
  /** Items to use today or soon (from the Stock screen's "Use soon"). */
  urgentItemIds: ReadonlySet<string>
  /** Items that have ever been stocked here. Spices and oils only count once they are. */
  trackedItemIds: ReadonlySet<string>
  /** A day in the non-veg rhythm (see src/calendar/rhythm.ts). */
  nonVegDay: boolean
  history: ReadonlyMap<string, DishHistory>
  /** Names in the person's chosen script. */
  itemName: (item: Item) => string
  dishName: (dish: Dish) => string
}

export interface Scored {
  combo: Combo
  score: number
  /** Each factor's weighted contribution. */
  factors: Record<Factor, number>
  /** "Uses brinjal before it spoils · A favourite". Empty when nothing stands out. */
  why: string
  /** Names of needed ingredients with none in stock. */
  needs: string[]
  /** "Cooked 45 days ago" or "Not cooked yet", for the main dish. */
  cooked: string
}

/** The ingredients still to cook: the main's, the rice's, and the sides', except a leftover side's. */
export function comboIngredients(combo: Combo) {
  const dishes = [combo.main, ...(combo.base ? [combo.base] : []), ...combo.sides.filter((s) => s.id !== combo.leftover?.dish_id)]
  return dishes.flatMap((d) => d.ingredients)
}

/**
 * Spices and oils are in almost everything and rarely stocked item by item, so they
 * only count as needed once someone has tracked them. Everything else always counts.
 */
const PANTRY = new Set(['spice', 'oil'])

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export function scoreCombo(combo: Combo, ctx: PlanContext): Scored {
  const ingredients = comboIngredients(combo)
  const needed = ingredients.filter((i) => {
    if (i.optional) return false
    const item = ctx.itemsById.get(i.item_id)
    return !item || !PANTRY.has(item.category) || ctx.trackedItemIds.has(i.item_id)
  })
  const have = (itemId: string) => ctx.stockTotals.get(itemId) ?? 0

  const urgent = [...new Set(ingredients.map((i) => i.item_id))].filter((id) => ctx.urgentItemIds.has(id) && have(id) > 0)
  const enough = needed.filter((i) => have(i.item_id) + 1e-9 >= i.quantity).length
  const missing = [...new Set(needed.filter((i) => have(i.item_id) <= 0).map((i) => i.item_id))]

  const h = ctx.history.get(combo.main.id)
  const days = daysSince(h?.lastCooked ?? null, ctx.today)
  const effectiveDays = days ?? SCORING.neverCookedDays

  const raw: Record<Factor, number> = {
    nearExpiry: urgent.length === 0 ? 0 : urgent.length === 1 ? SCORING.nearExpiryOne : 1,
    inStock: needed.length ? enough / needed.length : 1,
    favourite: combo.main.is_favourite ? 1 : 0,
    kidsFavourite: combo.main.is_kids_favourite ? 1 : 0,
    daysSinceCooked: Math.min(effectiveDays, SCORING.fullAfterDays) / SCORING.fullAfterDays,
    recentlyCooked: days !== null && days <= SCORING.recentDays ? 1 : 0,
    leftover: combo.leftover ? 1 : 0,
    calendar: ctx.nonVegDay && comboIsNonVeg(combo) ? 1 : 0,
    nutrition: 0,
  }
  const factors = Object.fromEntries(
    (Object.keys(WEIGHTS) as Factor[]).map((f) => [f, raw[f] * WEIGHTS[f]]),
  ) as Record<Factor, number>
  const score = Object.values(factors).reduce((s, v) => s + v, 0)

  const name = (id: string) => {
    const item = ctx.itemsById.get(id)
    return item ? ctx.itemName(item) : null
  }
  const leftoverDish = combo.leftover ? combo.sides.find((s) => s.id === combo.leftover!.dish_id) : undefined
  const phrase: Record<Factor, () => string | null> = {
    nearExpiry: () => {
      const names = urgent.map(name).filter((n): n is string => !!n).slice(0, 2)
      return names.length ? `Uses ${list(names)} before ${names.length === 1 ? 'it spoils' : 'they spoil'}` : null
    },
    inStock: () => (raw.inStock === 1 ? "Everything's in stock" : null),
    favourite: () => 'A favourite',
    kidsFavourite: () => 'Kids love it',
    // The card's "Cooked 45 days ago" note says this already.
    daysSinceCooked: () => null,
    recentlyCooked: () => null,
    leftover: () => (leftoverDish ? `Uses leftover ${ctx.dishName(leftoverDish)}` : null),
    calendar: () => 'Non-veg day',
    nutrition: () => null,
  }
  const why = (Object.keys(factors) as Factor[])
    .filter((f) => factors[f] >= SCORING.whyThreshold)
    .sort((a, b) => factors[b] - factors[a])
    .map((f) => phrase[f]())
    .filter((p): p is string => !!p)
    .slice(0, 2)
    .join(' · ')

  return {
    combo,
    score,
    factors,
    why,
    needs: missing.map(name).filter((n): n is string => !!n),
    cooked: cookedNote(h?.lastCooked ?? null, ctx.today),
  }
}

/** A small, stable hash: the same seed always breaks ties the same way. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const TOP_PICKS = 3
/** A liked dish not had for this long is worth bringing back. */
export const REDISCOVER_AFTER_DAYS = 30

export interface Suggestions {
  /** Best first; shown three at a time. */
  picks: Scored[]
  /** "Bring back?": a liked dish not cooked for a while, from outside the top picks. */
  rediscovery: Scored | null
}

/**
 * Ranks combos. Ties break by a daily seed (date and meal), so the order varies from
 * day to day but stays put while you look.
 */
export function suggest(combos: readonly Combo[], ctx: PlanContext, seed: string): Suggestions {
  const ranked = combos
    .map((c) => scoreCombo(c, ctx))
    .sort((a, b) => b.score - a.score || hash(`${seed}:${a.combo.main.id}`) - hash(`${seed}:${b.combo.main.id}`))

  const rest = ranked.slice(TOP_PICKS)
  const history = (s: Scored) => ctx.history.get(s.combo.main.id)
  const liked = (s: Scored) => s.combo.main.is_favourite || s.combo.main.is_kids_favourite || (history(s)?.timesCooked ?? 0) >= 2
  const stale = (s: Scored) => {
    const d = daysSince(history(s)?.lastCooked ?? null, ctx.today)
    return d !== null && d >= REDISCOVER_AFTER_DAYS
  }
  const rediscovery = rest.find((s) => liked(s) && stale(s)) ?? rest.find((s) => !history(s)) ?? null
  return { picks: ranked.filter((s) => s !== rediscovery), rediscovery }
}
