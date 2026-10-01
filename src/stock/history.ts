// An item's history, one plain line per stock event.

import { formatDay } from '../lib/dates.ts'
import type { Item, StockEvent } from './types.ts'
import { formatQuantity } from './units.ts'

type HistoryItem = Pick<Item, 'unit' | 'piece_weight_g'>

/** "5 Oct" */
export function shortDate(date: string): string {
  return formatDay(date)
}

/** "Bought 500 g · use by 5 Oct", "Used 250 g", "Corrected to 300 g", "Undo: put back 250 g". */
export function describeEvent(e: StockEvent, item: HistoryItem): string {
  const q = (n: number) => formatQuantity(Math.abs(n), item)
  const opened = e.form === 'opened' ? ' opened' : ''
  switch (e.kind) {
    case 'delta': {
      if (e.batch_id) return e.quantity > 0 ? `Undo: put back ${q(e.quantity)}` : `Undo: took back ${q(e.quantity)}`
      if (e.quantity >= 0) {
        const verb = e.reason === 'bought' || !e.reason ? 'Bought' : 'Added'
        return `${verb} ${q(e.quantity)}${opened}${e.expires_on ? ` · use by ${shortDate(e.expires_on)}` : ''}`
      }
      const verb = e.reason === 'spoiled' ? 'Spoiled' : e.reason === 'cooked' ? 'Cooked with' : 'Used'
      return `${verb} ${q(e.quantity)}${opened}`
    }
    case 'set':
      if (e.quantity === 0 && e.reason === 'used') return `Used up${opened ? ' (opened)' : ''}`
      return `Corrected${opened ? ' opened' : ''} to ${q(e.quantity)}`
    case 'expiry':
      return `Use-by date changed to ${shortDate(e.expires_on!)}`
    case 'open':
      return `Opened ${q(e.quantity)}`
  }
}

/** Newest first, by when it happened on the phone. */
export function newestFirst(events: readonly StockEvent[]): StockEvent[] {
  return [...events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at))
}
