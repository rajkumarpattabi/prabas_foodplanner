// What the Stock screen shows: each item's stock and urgency, sorted into sections.

import { computeStock, type Stock } from './computeStock.ts'
import type { Item, StockEvent } from './types.ts'
import { isShown, urgencyOf, type Group, type Urgency } from './urgency.ts'
import { daysLeft } from './usage.ts'

export interface StockRow {
  item: Item
  events: StockEvent[]
  stock: Stock
  urgency: Urgency
}

export function stockRow(item: Item, events: StockEvent[], now = new Date()): StockRow {
  const stock = computeStock(item, events)
  const first = events.reduce<string | null>((min, e) => (min === null || e.occurred_at < min ? e.occurred_at : min), null)
  const left = item.is_staple ? daysLeft(stock.total, stock.usage, first, now) : null
  return { item, events, stock, urgency: urgencyOf(item, stock, left, now) }
}

/** Every item that isn't archived, with its stock. */
export function stockRows(items: readonly Item[], eventsByItem: ReadonlyMap<string, StockEvent[]>, now = new Date()): StockRow[] {
  return items.filter((i) => !i.archived).map((i) => stockRow(i, eventsByItem.get(i.id) ?? [], now))
}

export type Sections = Record<Group, StockRow[]>

/** The three sections, most urgent first within each. Items not in stock (bar staples) are left out. */
export function sections(rows: readonly StockRow[]): Sections {
  const out: Sections = { use_soon: [], running_low: [], fine: [] }
  for (const r of rows) if (isShown(r.item, r.stock)) out[r.urgency.group].push(r)
  const byUrgency = (a: StockRow, b: StockRow) => a.urgency.rank - b.urgency.rank || a.item.name_en.localeCompare(b.item.name_en)
  for (const list of Object.values(out)) list.sort(byUrgency)
  return out
}
