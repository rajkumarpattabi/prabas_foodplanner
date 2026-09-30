// The stock changes behind the quick actions on the Stock screen, and their exact undo.

import { computeStock, type Stock } from './computeStock.ts'
import type { NewStockEvent } from './stockContext.ts'
import type { Form, Item, StockEvent, StockReason } from './types.ts'

type ActionItem = Pick<Item, 'id' | 'step' | 'has_opened_form'>
type ShelfItem = Pick<Item, 'id' | 'shelf_life_days' | 'opened_shelf_life_days'>

const EPSILON = 1e-9

/** "+": one step bought. */
export function plusEvents(item: ActionItem): NewStockEvent[] {
  return [{ item_id: item.id, kind: 'delta', quantity: item.step, reason: 'bought' }]
}

/** "−": one step used, opened first (the opened coconut before a whole one). Never more than there is. */
export function minusEvents(item: ActionItem, stock: Stock): NewStockEvent[] {
  const form: Form = item.has_opened_form && stock.opened > EPSILON ? 'opened' : 'whole'
  const have = form === 'opened' ? stock.opened : stock.whole
  if (have <= EPSILON) return []
  return [{ item_id: item.id, kind: 'delta', quantity: -Math.min(item.step, have), reason: 'used', form }]
}

/** Swipe: all of it used up. */
export function usedUpEvents(item: ActionItem, stock: Stock): NewStockEvent[] {
  const forms: Form[] = ['whole', 'opened']
  return forms
    .filter((f) => (f === 'opened' ? stock.opened : stock.whole) > EPSILON)
    .map((form) => ({ item_id: item.id, kind: 'set', quantity: 0, reason: 'used', form }))
}

/** Why the stock put back by an undo had been taken: decides whether it had counted as use. */
function takenFor(e: StockEvent): StockReason | null {
  if (e.kind === 'open') return null // Opening a coconut isn't using it.
  if (e.kind === 'set') return 'correction'
  return e.reason ?? 'used'
}

/**
 * The events that exactly undo `added`: whatever was taken goes back into the same
 * purchases (keeping their expiry dates), and anything added is taken back out.
 * Events are never deleted, so an undo is just more events.
 */
export function undoEvents(item: ShelfItem, before: readonly StockEvent[], added: readonly StockEvent[]): NewStockEvent[] {
  if (!added.length) return []
  const was = computeStock(item, before).batches
  const now = computeStock(item, [...before, ...added]).batches
  const reason = takenFor(added[0])
  const out: NewStockEvent[] = []
  for (const b of was) {
    const taken = b.remaining - (now.find((x) => x.id === b.id)?.remaining ?? 0)
    if (taken > EPSILON) {
      out.push({ item_id: item.id, kind: 'delta', quantity: taken, batch_id: b.id, form: b.form, reason, note: 'undo' })
    }
  }
  for (const b of now) {
    if (!was.some((x) => x.id === b.id)) {
      out.push({
        item_id: item.id,
        kind: 'delta',
        quantity: -b.remaining,
        batch_id: b.id,
        form: b.form,
        reason: 'correction',
        note: 'undo',
      })
    }
  }
  return out
}
