// Cooking a combo: the stock it uses, one line per item, each editable before it's taken.

import type { NewStockEvent } from '../stock/stockContext.ts'
import type { Combo } from './combos.ts'
import { comboIngredients } from './score.ts'
import type { MealDishName } from './types.ts'

export interface CookLine {
  item_id: string
  /** For five, in the item's stored unit: the dishes' amounts added together. */
  quantity: number
  /** Optional in every dish that uses it. */
  optional: boolean
  /** Taken from stock when confirmed. Optional ones start unticked. */
  include: boolean
}

/** One line per item, the main's and sides' amounts combined. A leftover side needs nothing. */
export function cookLines(combo: Combo): CookLine[] {
  const lines = new Map<string, CookLine>()
  for (const ing of comboIngredients(combo)) {
    const line = lines.get(ing.item_id)
    if (line) {
      line.quantity += ing.quantity
      line.optional = line.optional && !!ing.optional
      line.include = !line.optional
    } else {
      lines.set(ing.item_id, { item_id: ing.item_id, quantity: ing.quantity, optional: !!ing.optional, include: !ing.optional })
    }
  }
  return [...lines.values()]
}

/**
 * The stock to take. Never more than there is (so history stays true), and nothing for
 * items with none in stock: they were bought outside the app, or not tracked.
 */
export function cookEvents(lines: readonly CookLine[], stockTotals: ReadonlyMap<string, number>): NewStockEvent[] {
  return lines.flatMap((l) => {
    const have = stockTotals.get(l.item_id) ?? 0
    const take = Math.min(l.quantity, have)
    return l.include && take > 0 ? [{ item_id: l.item_id, kind: 'delta' as const, quantity: -take, reason: 'cooked' as const }] : []
  })
}

/** The names to keep with the meal: the main first, then its rice, then the sides. */
export function dishNames(combo: Combo): MealDishName[] {
  return [combo.main, ...(combo.base ? [combo.base] : []), ...combo.sides].map((d) => ({ dish_id: d.id, name_ta: d.name_ta, name_en: d.name_en, type: d.type }))
}
