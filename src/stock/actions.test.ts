import { describe, expect, test } from 'vitest'
import { minusEvents, plusEvents, undoEvents, usedUpEvents } from './actions.ts'
import { computeStock } from './computeStock.ts'
import type { NewStockEvent } from './stockContext.ts'
import type { StockEvent } from './types.ts'

let n = 0
let clock = new Date(2026, 8, 20, 9).getTime()

/** Saves new events as the provider does, each a minute after the last. */
function save(events: NewStockEvent[]): StockEvent[] {
  return events.map((e) => {
    clock += 60_000
    const at = new Date(clock).toISOString()
    return {
      reason: null,
      batch_id: null,
      expires_on: null,
      form: 'whole',
      note: null,
      occurred_at: at,
      ...e,
      id: `e${String(++n).padStart(3, '0')}`,
      household_id: 'hh',
      created_by: 'u1',
      created_at: at,
    }
  })
}

const tomato = { id: 'tomato', step: 250, has_opened_form: false, shelf_life_days: 5, opened_shelf_life_days: null }
const coconut = { id: 'coconut', step: 1, has_opened_form: true, shelf_life_days: 30, opened_shelf_life_days: 3 }

const bought = (item: { id: string }, quantity: number, expires_on: string | null = null) =>
  save([{ item_id: item.id, kind: 'delta', quantity, reason: 'bought', expires_on }])

const usedSum = (s: ReturnType<typeof computeStock>) => s.usage.reduce((t, u) => t + u.amount, 0)

/** Do an action, undo it, and check stock is exactly as before. */
function expectExactUndo(item: typeof tomato | typeof coconut, before: StockEvent[], action: NewStockEvent[]) {
  const added = save(action)
  const undo = save(undoEvents(item, before, added))
  const was = computeStock(item, before)
  const now = computeStock(item, [...before, ...added, ...undo])
  const shape = (s: typeof was) => s.batches.map((b) => [b.id, b.form, b.remaining, b.expiresOn])
  expect(shape(now)).toEqual(shape(was))
  expect(now.total).toBe(was.total)
  expect(usedSum(now)).toBe(usedSum(was))
  return { added, undo }
}

describe('quick actions', () => {
  test('+ adds one step, − takes one step but never more than there is', () => {
    expect(plusEvents(tomato)).toEqual([{ item_id: 'tomato', kind: 'delta', quantity: 250, reason: 'bought' }])
    const s = computeStock(tomato, bought(tomato, 100))
    expect(minusEvents(tomato, s)).toMatchObject([{ quantity: -100, reason: 'used', form: 'whole' }])
    expect(minusEvents(tomato, computeStock(tomato, []))).toEqual([])
  })

  test('− takes the opened coconut before a whole one', () => {
    const events = [...bought(coconut, 2), ...save([{ item_id: 'coconut', kind: 'open', quantity: 1 }])]
    expect(minusEvents(coconut, computeStock(coconut, events))).toMatchObject([{ quantity: -1, form: 'opened' }])
  })

  test('used up sets every form to zero', () => {
    const events = [...bought(coconut, 2), ...save([{ item_id: 'coconut', kind: 'open', quantity: 1 }])]
    const s = computeStock(coconut, [...events, ...save(usedUpEvents(coconut, computeStock(coconut, events)))])
    expect(s.total).toBe(0)
  })
})

describe('exact undo', () => {
  test('used up across two purchases: each comes back with its own expiry date', () => {
    const before = [...bought(tomato, 500, '2026-09-23'), ...bought(tomato, 1000, '2026-09-28')]
    const { undo } = expectExactUndo(tomato, before, usedUpEvents(tomato, computeStock(tomato, before)))
    expect(undo).toHaveLength(2)
    expect(undo.every((e) => e.note === 'undo' && e.batch_id)).toBe(true)
  })

  test('−, from the purchase expiring first', () => {
    const before = [...bought(tomato, 1000, '2026-09-28'), ...bought(tomato, 200, '2026-09-22')]
    expectExactUndo(tomato, before, minusEvents(tomato, computeStock(tomato, before)))
  })

  test('+, taking back the new purchase only', () => {
    const before = bought(tomato, 500)
    const { undo } = expectExactUndo(tomato, before, plusEvents(tomato))
    expect(undo).toMatchObject([{ quantity: -250 }])
  })

  test('opening a coconut', () => {
    expectExactUndo(coconut, bought(coconut, 2), [{ item_id: 'coconut', kind: 'open', quantity: 1 }])
  })

  test('a correction down to a number', () => {
    const before = [...bought(tomato, 500), ...bought(tomato, 500)]
    expectExactUndo(tomato, before, [{ item_id: 'tomato', kind: 'set', quantity: 300, reason: 'correction' }])
  })

  test('spoiled stock put back still never counted as use', () => {
    const before = bought(tomato, 500)
    expectExactUndo(tomato, before, [{ item_id: 'tomato', kind: 'delta', quantity: -500, reason: 'spoiled' }])
  })

  test("the other phone's changes in between are left alone", () => {
    const before = bought(tomato, 1000)
    const added = save(minusEvents(tomato, computeStock(tomato, before)))
    const undo = undoEvents(tomato, before, added)
    const theirs = save([{ item_id: 'tomato', kind: 'delta', quantity: -300, reason: 'cooked' }])
    const s = computeStock(tomato, [...before, ...added, ...theirs, ...save(undo)])
    expect(s.total).toBe(700)
  })
})
