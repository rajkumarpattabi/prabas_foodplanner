// A combo is a main dish and up to two sides. Mains come from the library; sides
// from each main's ranked list, one of each kind, with a leftover used first.

import type { Dish, DishType, Meal } from '../dishes/types.ts'
import type { LocalDate } from '../lib/dates.ts'
import type { Leftover } from './types.ts'

export const MAX_SIDES = 2

export interface Combo {
  main: Dish
  /** Plain rice, for a gravy eaten with rice (kuzhambu, sambar, rasam, non-veg gravy). */
  base: Dish | null
  sides: Dish[]
  /** The leftover serving one of the sides, if any: it's already cooked. */
  leftover: Leftover | null
}

/** Dishes that make a meal on their own. */
const STANDALONE: ReadonlySet<DishType> = new Set(['tiffin', 'variety_rice', 'drink', 'snack'])

/** Gravies eaten with rice: a main at lunch or dinner when they have sides of their own. */
const WITH_RICE: ReadonlySet<DishType> = new Set(['kuzhambu', 'sambar', 'rasam', 'nonveg_gravy'])

/** The catalogue's plain rice, served with gravy mains. */
export const PLAIN_RICE_KEY = 'sadam'

/**
 * What kind of side a dish is: a combo gets at most one of each, so plain rice comes
 * with a sambar and a poriyal, not a sambar and a kuzhambu.
 */
const SIDE_KIND: Record<DishType, string> = {
  kuzhambu: 'gravy',
  sambar: 'gravy',
  rasam: 'gravy',
  kootu: 'gravy',
  nonveg_gravy: 'gravy',
  poriyal: 'dry',
  nonveg_fry: 'dry',
  chutney: 'chutney',
  tiffin: 'tiffin',
  variety_rice: 'rice',
  drink: 'drink',
  snack: 'snack',
  sweet: 'sweet',
  juice: 'juice',
  salad_soup: 'salad',
  prepared: 'prepared',
}

/** Gravies that go with idli, dosa or chapati even if not listed as their side. */
const TIFFIN_GRAVIES: ReadonlySet<DishType> = new Set(['kuzhambu', 'sambar', 'kootu', 'nonveg_gravy'])

/**
 * Tiffin, rice, drinks and snacks make a meal; so does a gravy with its own sides at
 * lunch or dinner (rice, kuzhambu and a poriyal). A sambar is never breakfast on its own.
 */
export function isMainFor(dish: Dish, meal: Meal): boolean {
  if (dish.dont_suggest || !dish.meals.includes(meal)) return false
  return STANDALONE.has(dish.type) || (meal !== 'breakfast' && WITH_RICE.has(dish.type) && dish.side_ids.length > 0)
}

/** Leftovers still good to eat today, newest first. */
export function usableLeftovers(leftovers: readonly Leftover[], today: LocalDate): Leftover[] {
  return leftovers
    .filter((l) => l.eaten_at === null && l.expires_on >= today && l.dish_id !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/**
 * The sides for a main: a leftover first if it fits (one of its sides, or a gravy with
 * tiffin), then its ranked sides, skipping hidden ones and a second side of the same kind.
 */
export function comboFor(
  main: Dish,
  dishesById: ReadonlyMap<string, Dish>,
  leftovers: readonly Leftover[] = [],
  plainRice: Dish | null = null,
  /** A veg-only day (Saturday, Amavasai, Puratasi…): no non-veg sides or leftovers. */
  vegOnly = false,
): Combo {
  const sides: Dish[] = []
  const kinds = new Set<string>()
  const take = (d: Dish) => {
    if (sides.length >= MAX_SIDES || d.id === main.id || sides.some((s) => s.id === d.id) || kinds.has(SIDE_KIND[d.type])) return false
    if (vegOnly && !d.is_veg) return false
    sides.push(d)
    kinds.add(SIDE_KIND[d.type])
    return true
  }

  let leftover: Leftover | null = null
  for (const l of leftovers) {
    const dish = dishesById.get(l.dish_id!)
    if (!dish) continue
    const fits = main.side_ids.includes(dish.id) || (main.type === 'tiffin' && TIFFIN_GRAVIES.has(dish.type))
    if (fits && take(dish)) {
      leftover = l
      break
    }
  }
  for (const id of main.side_ids) {
    const d = dishesById.get(id)
    if (d && !d.dont_suggest) take(d)
  }
  return { main, base: WITH_RICE.has(main.type) && plainRice && plainRice.id !== main.id ? plainRice : null, sides, leftover }
}

/** Every combo for a meal, one per main dish. On a veg-only day, nothing non-veg at all. */
export function combosFor(meal: Meal, dishes: readonly Dish[], leftovers: readonly Leftover[] = [], { vegOnly = false } = {}): Combo[] {
  const byId = new Map(dishes.map((d) => [d.id, d]))
  const plainRice = dishes.find((d) => d.catalog_key === PLAIN_RICE_KEY) ?? null
  return dishes
    .filter((d) => isMainFor(d, meal) && (!vegOnly || d.is_veg))
    .map((d) => comboFor(d, byId, leftovers, plainRice, vegOnly))
}

/**
 * Other sides to swap in for one: the main's other ranked sides first, then other
 * dishes of the same type. Never the main itself, hidden dishes, or sides already chosen.
 */
export function alternativeSides(combo: Combo, replacing: Dish, dishes: readonly Dish[], limit = 12, vegOnly = false): Dish[] {
  const byId = new Map(dishes.map((d) => [d.id, d]))
  const taken = new Set([combo.main.id, ...combo.sides.map((s) => s.id)])
  const out: Dish[] = []
  const add = (d: Dish | undefined) => {
    if (d && !d.dont_suggest && (!vegOnly || d.is_veg) && !taken.has(d.id) && !out.includes(d)) out.push(d)
  }
  combo.main.side_ids.forEach((id) => add(byId.get(id)))
  dishes
    .filter((d) => d.type === replacing.type)
    .sort((a, b) => a.name_en.localeCompare(b.name_en))
    .forEach(add)
  return out.slice(0, limit)
}

/**
 * A saved meal as a combo again: its main, its rice, and its sides, in order. Null if
 * the main dish has since been deleted (the meal's saved names still say what it was).
 */
export function comboFromMeal(
  dishIds: readonly string[],
  dishesById: ReadonlyMap<string, Dish>,
  leftovers: readonly Leftover[] = [],
): Combo | null {
  const [mainId, ...rest] = dishIds
  const main = dishesById.get(mainId)
  if (!main) return null
  const others = rest.map((id) => dishesById.get(id)).filter((d): d is Dish => d !== undefined)
  const base = WITH_RICE.has(main.type) ? (others.find((d) => d.catalog_key === PLAIN_RICE_KEY) ?? null) : null
  const sides = others.filter((d) => d !== base)
  const leftover = leftovers.find((l) => l.dish_id !== null && sides.some((s) => s.id === l.dish_id)) ?? null
  return { main, base, sides, leftover }
}

/** Is anything in it meat, fish or egg? */
export const comboIsNonVeg = (combo: Combo) => !combo.main.is_veg || combo.sides.some((s) => !s.is_veg)

/** Swap one side for another, keeping its place. */
export function swapSide(combo: Combo, replacing: Dish, next: Dish): Combo {
  return {
    ...combo,
    sides: combo.sides.map((s) => (s.id === replacing.id ? next : s)),
    leftover: combo.leftover?.dish_id === replacing.id ? null : combo.leftover,
  }
}
