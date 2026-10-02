// What the review needs from the rest of the app: past prices per item, what was bought
// today already, and the bill's total. Pure, so it's tested without screens.

import { localDate, type LocalDate } from '../lib/dates.ts'
import type { Item, StockEvent } from '../stock/types.ts'
import type { PricedPurchase } from './estimate.ts'
import type { BillAlias } from './match.ts'
import type { BillLine } from './parse.ts'
import type { ReviewContext } from './review.ts'

export function reviewContext({
  items,
  eventsByItem,
  aliases,
  vendor,
  today,
}: {
  items: readonly Item[]
  eventsByItem: ReadonlyMap<string, readonly StockEvent[]>
  aliases: readonly BillAlias[]
  vendor: string
  today: LocalDate
}): ReviewContext {
  const purchases = new Map<string, PricedPurchase[]>()
  const boughtToday = new Set<string>()
  for (const [itemId, events] of eventsByItem) {
    // Purchases still standing: an undo takes one back out with an event pointing at it.
    const undone = new Set(events.filter((e) => e.note === 'undo' && e.quantity < 0).map((e) => e.batch_id))
    const bought = events.filter((e) => e.kind === 'delta' && e.reason === 'bought' && e.quantity > 0 && !undone.has(e.id))
    const priced = bought.filter((e) => e.price != null).map((e) => ({ quantity: e.quantity, price: e.price ?? null, occurred_at: e.occurred_at }))
    if (priced.length) purchases.set(itemId, priced)
    if (bought.some((e) => localDate(new Date(e.occurred_at)) === today)) boughtToday.add(itemId)
  }
  return { items, aliases, vendor, purchases, boughtToday }
}

const TOTAL = /\b(grand\s*total|net\s*amount|total)\b|மொத்தம்/i

/** The bill's total, from its "Total 235" line (the last one, after any sub total). */
export function billTotal(lines: readonly BillLine[]): number | null {
  const totals = lines.filter((l) => l.other && TOTAL.test(l.raw) && !/sub\s*total/i.test(l.raw))
  const last = totals.at(-1)
  const numbers = last?.raw.replace(/,(?=\d{3}\b)/g, '').match(/\d+(\.\d+)?/g)
  return numbers ? Number(numbers.at(-1)) : null
}
