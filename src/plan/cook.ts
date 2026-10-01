// Cooking a combo: the stock it uses, one line per item, each editable before it's taken.

import { takeFromBatches, type ReadyPrepared } from '../prepared/ready.ts'
import type { NewStockEvent } from '../stock/stockContext.ts'
import type { Combo } from './combos.ts'
import { comboIngredients, comboPrepared } from './score.ts'
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

export interface PreparedLine {
  /** The prepared item: batter, koozh. */
  dish_id: string
  /** Meals or glasses. */
  quantity: number
  /** Ready now, across its batches. */
  available: number
  optional: boolean
  include: boolean
}

/** One line per prepared item used: "Idli/dosa batter · 1 meal (3 left)". */
export function preparedLines(combo: Combo, ready: ReadonlyMap<string, ReadyPrepared>): PreparedLine[] {
  return comboPrepared(combo).map((u) => {
    const available = ready.get(u.dish_id)?.remaining ?? 0
    return { dish_id: u.dish_id, quantity: u.quantity, available, optional: u.optional, include: available > 0 && !u.optional }
  })
}

/** What to take from which batch, oldest first. Nothing for an item with none ready. */
export function preparedEvents(lines: readonly PreparedLine[], ready: ReadonlyMap<string, ReadyPrepared>) {
  return lines.flatMap((l) => (l.include ? takeFromBatches(ready.get(l.dish_id), l.quantity) : []))
}

/** The names to keep with the meal: the main first, then its rice, then the sides. */
export function dishNames(combo: Combo): MealDishName[] {
  return [combo.main, ...(combo.base ? [combo.base] : []), ...combo.sides].map((d) => ({ dish_id: d.id, name_ta: d.name_ta, name_en: d.name_en, type: d.type }))
}
