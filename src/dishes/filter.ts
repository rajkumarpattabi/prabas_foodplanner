// What the Dishes screen lists, given the search and filter chips.

import { searchItems } from '../stock/search.ts'
import { DISH_TYPES, type Dish, type DishType, type Meal } from './types.ts'

export interface DishFilter {
  query: string
  type: DishType | null
  meal: Meal | null
  favourites: boolean
  /** Only the dishes hidden from suggestions. Otherwise hidden ones are listed too, marked. */
  hidden: boolean
}

export const NO_FILTER: DishFilter = { query: '', type: null, meal: null, favourites: false, hidden: false }

const typeOrder = new Map(DISH_TYPES.map((t, i) => [t, i]))

/**
 * Searching lists best matches first; otherwise dishes are grouped by type in the
 * usual order (tiffin, rice, kuzhambu…) and then by English name.
 */
export function filterDishes(dishes: readonly Dish[], f: DishFilter): Dish[] {
  const base = f.query.trim()
    ? searchItems(dishes, f.query)
    : [...dishes].sort((a, b) => typeOrder.get(a.type)! - typeOrder.get(b.type)! || a.name_en.localeCompare(b.name_en))
  return base.filter(
    (d) =>
      (!f.type || d.type === f.type) &&
      (!f.meal || d.meals.includes(f.meal)) &&
      (!f.favourites || d.is_favourite || d.is_kids_favourite) &&
      (!f.hidden || d.dont_suggest),
  )
}
