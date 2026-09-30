// Adding stock: what the Add stock sheet fills in, and the items and events it saves.

import { addDays, type LocalDate } from '../lib/dates.ts'
import { fold } from './search.ts'
import type { NewItem, NewStockEvent } from './stockContext.ts'
import type { BaseUnit, Category, EntryUnit, Item } from './types.ts'
import { fromBase, toBase } from './units.ts'

/** Usual unit and shelf life per category, as in the starter catalogue. */
const CATEGORY_DEFAULTS: Record<Category, { unit: BaseUnit; shelfLifeDays: number | null }> = {
  vegetable: { unit: 'g', shelfLifeDays: 5 },
  greens: { unit: 'bunch', shelfLifeDays: 2 },
  fruit: { unit: 'g', shelfLifeDays: 5 },
  meat: { unit: 'g', shelfLifeDays: 2 },
  fish: { unit: 'g', shelfLifeDays: 1 },
  egg: { unit: 'piece', shelfLifeDays: 14 },
  dairy: { unit: 'ml', shelfLifeDays: 3 },
  grain: { unit: 'g', shelfLifeDays: null },
  dal: { unit: 'g', shelfLifeDays: null },
  spice: { unit: 'g', shelfLifeDays: null },
  oil: { unit: 'ml', shelfLifeDays: null },
  other: { unit: 'g', shelfLifeDays: null },
}

export const defaultUnitFor = (category: Category): BaseUnit => CATEGORY_DEFAULTS[category].unit

/** Bought by the kilo or litre, except spices and small things, counted in g and ml. */
function displayUnitFor(unit: BaseUnit, category: Category): EntryUnit {
  if (unit === 'g') return category === 'spice' || category === 'other' || category === 'dairy' ? 'g' : 'kg'
  if (unit === 'ml') return category === 'oil' ? 'l' : 'ml'
  return unit
}

const isTamil = (s: string) => /[஀-௿]/.test(s)

export interface NewItemInput {
  name_ta: string
  name_en: string
  category: Category
  unit: BaseUnit
  /** What was searched for. Kept as an alias when it's another spelling, so the same search finds it next time. */
  query?: string
}

export function newItem({ name_ta, name_en, category, unit, query = '' }: NewItemInput): NewItem {
  const names = [name_ta, name_en].map((n) => n.trim())
  const q = query.trim()
  const alias = q && !names.some((n) => fold(n) === fold(q)) ? [q] : []
  return {
    name_ta: names[0],
    name_en: names[1],
    category,
    unit,
    display_unit: displayUnitFor(unit, category),
    shelf_life_days: CATEGORY_DEFAULTS[category].shelfLifeDays,
    aliases: alias,
  }
}

/** Which name field a search should pre-fill: Tamil script goes in the Tamil name. */
export function namesFromQuery(query: string): { name_ta: string; name_en: string } {
  const q = query.trim()
  return isTamil(q) ? { name_ta: q, name_en: '' } : { name_ta: '', name_en: q }
}

type PurchaseItem = Pick<Item, 'id' | 'unit' | 'display_unit' | 'piece_weight_g' | 'step' | 'shelf_life_days'>

export interface PurchaseForm {
  amount: string
  unit: EntryUnit
  /** Empty for things that keep. */
  expiresOn: LocalDate | ''
}

/**
 * Pre-filled: one usual step, in the item's usual unit ("250 g" rather than "0.25 kg"),
 * expiring after its usual shelf life.
 */
export function purchaseDefaults(item: PurchaseItem, today: LocalDate): PurchaseForm {
  // display_unit is always the stored unit, or kg for g and l for ml, so this converts.
  const inDisplay = fromBase(item.step, item.display_unit, item) ?? item.step
  const unit = inDisplay < 1 ? item.unit : item.display_unit
  return {
    amount: String(unit === item.unit ? item.step : inDisplay),
    unit,
    expiresOn: item.shelf_life_days == null ? '' : addDays(today, item.shelf_life_days),
  }
}

/** Reads "1,5" too, as some keyboards type it. Null unless a positive number. */
export function parseAmount(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() && Number.isFinite(n) && n > 0 ? n : null
}

/** An entered amount in the item's stored unit, or null. Zero is allowed only when asked (for "Correct to 0"). */
export function amountToBase(
  text: string,
  unit: EntryUnit,
  item: Pick<Item, 'unit' | 'piece_weight_g'>,
  { allowZero = false } = {},
): number | null {
  const t = text.trim().replace(',', '.')
  const n = t ? Number(t) : NaN
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !allowZero)) return null
  return toBase(n, unit, item)
}

/**
 * The purchase to record, or null when the amount isn't usable. The expiry date is
 * always stored, so a later change to the item's shelf life doesn't move it.
 */
export function purchaseEvent(item: PurchaseItem, form: PurchaseForm): NewStockEvent | null {
  const amount = parseAmount(form.amount)
  const quantity = amount === null ? null : toBase(amount, form.unit, item)
  if (!quantity || quantity <= 0) return null
  return { item_id: item.id, kind: 'delta', quantity, reason: 'bought', expires_on: form.expiresOn || null }
}
