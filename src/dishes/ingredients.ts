// A dish's ingredients as the detail sheet lists them: each with its item and how
// much of it is in stock.

import { computeStock } from '../stock/computeStock.ts'
import type { Item, StockEvent } from '../stock/types.ts'
import type { Ingredient } from './types.ts'

/** enough: at least the dish's amount; some: less than that; none: nothing in stock. */
export type Availability = 'enough' | 'some' | 'none'

export interface IngredientLine {
  ingredient: Ingredient
  /** Null when the item is gone (removed from the list on another phone, say). */
  item: Item | null
  availability: Availability
}

export function ingredientLines(
  ingredients: readonly Ingredient[],
  itemsById: ReadonlyMap<string, Item>,
  eventsByItem: ReadonlyMap<string, StockEvent[]>,
): IngredientLine[] {
  return ingredients.map((ingredient) => {
    const item = itemsById.get(ingredient.item_id) ?? null
    const have = item ? computeStock(item, eventsByItem.get(item.id) ?? []).total : 0
    const availability: Availability = have <= 0 ? 'none' : have + 1e-9 >= ingredient.quantity ? 'enough' : 'some'
    return { ingredient, item, availability }
  })
}
