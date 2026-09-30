// Editing an item: the form's text fields, and the change they make to the item.

import { parseAmount } from './purchase.ts'
import type { ItemPatch } from './stockContext.ts'
import type { Category, EntryUnit, Item } from './types.ts'
import { fromBase, toBase } from './units.ts'

export interface ItemForm {
  name_ta: string
  name_en: string
  /** Comma-separated. */
  aliases: string
  category: Category
  display_unit: EntryUnit
  /** Days; blank for things that keep. */
  shelf_life_days: string
  is_staple: boolean
  /** In the display unit; blank for none. */
  low_threshold: string
  /** In the display unit. */
  step: string
  has_opened_form: boolean
  opened_shelf_life_days: string
}

/** The display units an item can use: its stored unit, plus kg or l for g or ml. */
export function displayUnits(item: Pick<Item, 'unit'>): EntryUnit[] {
  return item.unit === 'g' ? ['kg', 'g'] : item.unit === 'ml' ? ['l', 'ml'] : [item.unit]
}

const inDisplay = (n: number | null, item: Item) => (n === null ? '' : String(fromBase(n, item.display_unit, item) ?? n))

export function itemForm(item: Item): ItemForm {
  return {
    name_ta: item.name_ta,
    name_en: item.name_en,
    aliases: item.aliases.join(', '),
    category: item.category,
    display_unit: item.display_unit,
    shelf_life_days: item.shelf_life_days === null ? '' : String(item.shelf_life_days),
    is_staple: item.is_staple,
    low_threshold: inDisplay(item.low_threshold, item),
    step: inDisplay(item.step, item),
    has_opened_form: item.has_opened_form,
    opened_shelf_life_days: item.opened_shelf_life_days === null ? '' : String(item.opened_shelf_life_days),
  }
}

/** Blank → null; a whole number of days ≥ 1 → that; anything else → undefined (invalid). */
function days(text: string): number | null | undefined {
  const t = text.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 ? n : undefined
}

export function parseAliases(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of text.split(',').map((s) => s.trim())) {
    if (a && !seen.has(a.toLowerCase())) {
      seen.add(a.toLowerCase())
      out.push(a)
    }
  }
  return out
}

/** Only what changed, or a short message saying what to fix. */
export function itemPatch(item: Item, form: ItemForm): { patch: ItemPatch } | { error: string } {
  const name_ta = form.name_ta.trim()
  const name_en = form.name_en.trim()
  if (!name_ta || !name_en) return { error: 'Both names are needed.' }
  const aliases = parseAliases(form.aliases)
  if (aliases.length > 40) return { error: 'Up to 40 other names.' }
  const shelf = days(form.shelf_life_days)
  if (shelf === undefined) return { error: 'Shelf life is a number of days.' }
  const openedShelf = days(form.opened_shelf_life_days)
  if (openedShelf === undefined) return { error: 'Opened shelf life is a number of days.' }

  const stepAmount = parseAmount(form.step)
  const step = stepAmount === null ? null : toBase(stepAmount, form.display_unit, item)
  if (!step) return { error: 'The +/− step must be more than zero.' }

  let low_threshold: number | null = null
  if (form.low_threshold.trim()) {
    const n = Number(form.low_threshold.trim().replace(',', '.'))
    low_threshold = Number.isFinite(n) && n >= 0 ? toBase(n, form.display_unit, item) : null
    if (low_threshold === null) return { error: 'Running low is an amount, or blank for none.' }
  }

  const next: Required<ItemPatch> = {
    name_ta,
    name_en,
    aliases,
    category: form.category,
    display_unit: form.display_unit,
    shelf_life_days: shelf,
    is_staple: form.is_staple,
    low_threshold,
    piece_weight_g: item.piece_weight_g,
    has_opened_form: form.has_opened_form,
    opened_shelf_life_days: openedShelf,
    step,
    archived: item.archived,
  }
  const patch: ItemPatch = {}
  for (const key of Object.keys(next) as (keyof ItemPatch)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(item[key])) (patch as Record<string, unknown>)[key] = next[key]
  }
  return { patch }
}

/** The values a patch replaces, for undo. */
export function reversePatch(item: Item, patch: ItemPatch): ItemPatch {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof ItemPatch)[]) out[key] = item[key]
  return out as ItemPatch
}
