// Current stock, replayed from events. Stock is never stored as a number that gets
// overwritten, so two phones changing the same item at once both count.

import { addDays, localDate, type LocalDate } from '../lib/dates.ts'
import type { Form, Item, StockEvent } from './types.ts'

type ShelfItem = Pick<Item, 'shelf_life_days' | 'opened_shelf_life_days'>

/** What's left of one purchase (or one opened coconut). */
export interface Batch {
  /** The id of the event that created it. */
  id: string
  form: Form
  remaining: number
  /** null for things that keep. */
  expiresOn: LocalDate | null
  addedAt: string
}

/**
 * Taken out of stock by use or a downward correction; feeds "days left". Spoiled doesn't count.
 * An undone use is a negative amount, so the sum stays right.
 */
export interface Usage {
  at: string
  amount: number
}

export interface Stock {
  total: number
  whole: number
  opened: number
  /** Non-empty batches, soonest expiry first. */
  batches: Batch[]
  usage: Usage[]
  /** The newest event, for "Updated by you · 10 min ago". */
  lastEvent: StockEvent | null
}

/** Replay order: when it happened on the phone, then when it reached the server, then id. */
export function compareEvents(a: StockEvent, b: StockEvent): number {
  return (
    a.occurred_at.localeCompare(b.occurred_at) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )
}

/** Soonest expiry first; things that keep go last; then oldest purchase first. */
function byExpiry(a: Batch, b: Batch): number {
  if (a.expiresOn !== b.expiresOn) {
    if (a.expiresOn === null) return 1
    if (b.expiresOn === null) return -1
    return a.expiresOn.localeCompare(b.expiresOn)
  }
  return a.addedAt.localeCompare(b.addedAt)
}

const EPSILON = 1e-9

export function computeStock(item: ShelfItem, events: readonly StockEvent[]): Stock {
  const batches: Batch[] = []
  const usage: Usage[] = []
  const sorted = [...events].sort(compareEvents)

  const expiryFor = (form: Form, at: string): LocalDate | null => {
    const days = form === 'opened' ? (item.opened_shelf_life_days ?? item.shelf_life_days) : item.shelf_life_days
    return days == null ? null : addDays(localDate(new Date(at)), days)
  }

  const add = (e: StockEvent, form: Form, amount: number, expiresOn?: LocalDate | null) => {
    batches.push({
      id: e.id,
      form,
      remaining: amount,
      expiresOn: expiresOn !== undefined ? expiresOn : (e.expires_on ?? expiryFor(form, e.occurred_at)),
      addedAt: e.occurred_at,
    })
  }

  /** Take `amount` of `form`, soonest expiry first. Returns how much was actually there. */
  const take = (form: Form, amount: number): number => {
    let left = amount
    for (const b of batches.filter((x) => x.form === form).sort(byExpiry)) {
      if (left <= EPSILON) break
      const t = Math.min(b.remaining, left)
      b.remaining -= t
      left -= t
    }
    return amount - Math.max(0, left)
  }

  const totalOf = (form: Form) => batches.filter((b) => b.form === form).reduce((s, b) => s + b.remaining, 0)

  for (const e of sorted) {
    switch (e.kind) {
      case 'delta':
        if (e.batch_id) {
          // Aimed at one purchase: an undo puts back what was taken (keeping its expiry)
          // or takes back what was added. Put-back use no longer counts as use.
          const b = batches.find((x) => x.id === e.batch_id)
          if (!b) break
          if (e.quantity > 0) {
            b.remaining += e.quantity
            if (e.reason && e.reason !== 'spoiled') usage.push({ at: e.occurred_at, amount: -e.quantity })
          } else {
            b.remaining = Math.max(0, b.remaining + e.quantity)
          }
        } else if (e.quantity > 0) add(e, e.form, e.quantity)
        else if (e.quantity < 0) {
          const taken = take(e.form, -e.quantity)
          if (e.reason !== 'spoiled' && taken > 0) usage.push({ at: e.occurred_at, amount: taken })
        }
        break
      case 'set': {
        const current = totalOf(e.form)
        const target = Math.max(0, e.quantity)
        if (target < current) {
          const taken = take(e.form, current - target)
          usage.push({ at: e.occurred_at, amount: taken })
        } else if (target > current + EPSILON) {
          add(e, e.form, target - current)
        }
        break
      }
      case 'expiry': {
        const b = batches.find((x) => x.id === e.batch_id)
        if (b) b.expiresOn = e.expires_on
        break
      }
      case 'open': {
        const moved = take('whole', e.quantity > 0 ? e.quantity : 1)
        if (moved > 0) add(e, 'opened', moved, expiryFor('opened', e.occurred_at))
        break
      }
    }
  }

  const live = batches.filter((b) => b.remaining > EPSILON).sort(byExpiry)
  const whole = live.filter((b) => b.form === 'whole').reduce((s, b) => s + b.remaining, 0)
  const opened = live.filter((b) => b.form === 'opened').reduce((s, b) => s + b.remaining, 0)
  return {
    total: whole + opened,
    whole,
    opened,
    batches: live,
    usage,
    lastEvent: sorted.at(-1) ?? null,
  }
}
