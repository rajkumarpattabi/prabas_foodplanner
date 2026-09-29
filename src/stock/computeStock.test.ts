import { describe, expect, test } from 'vitest'
import { computeStock } from './computeStock.ts'
import type { StockEvent } from './types.ts'

let n = 0
/** An event at local time on 2026-09-dd hh:00 (tests run in IST). */
function ev(day: number, hour: number, e: Partial<StockEvent> & Pick<StockEvent, 'kind' | 'quantity'>): StockEvent {
  const at = new Date(2026, 8, day, hour).toISOString()
  return {
    id: `e${String(++n).padStart(3, '0')}`,
    household_id: 'hh',
    item_id: 'item',
    reason: e.kind === 'delta' && e.quantity > 0 ? 'bought' : 'used',
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: at,
    created_by: 'u1',
    created_at: at,
    ...e,
  }
}

const tomato = { shelf_life_days: 5, opened_shelf_life_days: null }
const rice = { shelf_life_days: null, opened_shelf_life_days: null }
const coconut = { shelf_life_days: 30, opened_shelf_life_days: 3 }

describe('computeStock', () => {
  test('no events: nothing in stock', () => {
    expect(computeStock(tomato, [])).toMatchObject({ total: 0, batches: [], lastEvent: null })
  })

  test('each purchase is its own batch with its own expiry', () => {
    const s = computeStock(tomato, [
      ev(20, 10, { kind: 'delta', quantity: 500 }),
      ev(25, 10, { kind: 'delta', quantity: 1000 }),
    ])
    expect(s.total).toBe(1500)
    expect(s.batches.map((b) => [b.remaining, b.expiresOn])).toEqual([
      [500, '2026-09-25'],
      [1000, '2026-09-30'],
    ])
  })

  test('using takes from the batch that expires first', () => {
    const s = computeStock(tomato, [
      ev(20, 10, { kind: 'delta', quantity: 500 }),
      ev(25, 10, { kind: 'delta', quantity: 1000 }),
      ev(26, 10, { kind: 'delta', quantity: -700 }),
    ])
    expect(s.total).toBe(800)
    expect(s.batches.map((b) => [b.remaining, b.expiresOn])).toEqual([[800, '2026-09-30']])
    expect(s.usage).toEqual([{ at: new Date(2026, 8, 26, 10).toISOString(), amount: 700 }])
  })

  test('a changed expiry date on the purchase is used', () => {
    const buy = ev(20, 10, { kind: 'delta', quantity: 500, expires_on: '2026-10-10' })
    expect(computeStock(tomato, [buy]).batches[0].expiresOn).toBe('2026-10-10')
    const later = ev(21, 9, { kind: 'expiry', quantity: 0, batch_id: buy.id, expires_on: '2026-09-22' })
    expect(computeStock(tomato, [buy, later]).batches[0].expiresOn).toBe('2026-09-22')
  })

  test('things that keep have no expiry', () => {
    expect(computeStock(rice, [ev(1, 9, { kind: 'delta', quantity: 5000 })]).batches[0].expiresOn).toBeNull()
  })

  test('stock never goes below zero, and only what was there counts as used', () => {
    const s = computeStock(tomato, [ev(20, 10, { kind: 'delta', quantity: 300 }), ev(21, 10, { kind: 'delta', quantity: -500 })])
    expect(s.total).toBe(0)
    expect(s.usage[0].amount).toBe(300)
  })

  test('spoiled is removed but not counted as use', () => {
    const s = computeStock(tomato, [
      ev(20, 10, { kind: 'delta', quantity: 500 }),
      ev(24, 10, { kind: 'delta', quantity: -200, reason: 'spoiled' }),
    ])
    expect(s.total).toBe(300)
    expect(s.usage).toEqual([])
  })

  describe('corrections ("it\'s actually 300 g")', () => {
    test('down: takes the difference, soonest expiry first, and counts it as use', () => {
      const s = computeStock(tomato, [
        ev(20, 10, { kind: 'delta', quantity: 500 }),
        ev(25, 10, { kind: 'delta', quantity: 500 }),
        ev(26, 10, { kind: 'set', quantity: 300, reason: 'correction' }),
      ])
      expect(s.total).toBe(300)
      expect(s.batches.map((b) => b.expiresOn)).toEqual(['2026-09-30'])
      expect(s.usage.at(-1)?.amount).toBe(700)
    })

    test('up: adds the difference as a new batch', () => {
      const s = computeStock(tomato, [
        ev(20, 10, { kind: 'delta', quantity: 200 }),
        ev(22, 10, { kind: 'set', quantity: 500, reason: 'correction' }),
      ])
      expect(s.total).toBe(500)
      expect(s.batches.map((b) => [b.remaining, b.expiresOn])).toEqual([
        [200, '2026-09-25'],
        [300, '2026-09-27'],
      ])
    })
  })

  describe('two phones at once', () => {
    test('two changes made at the same moment both count', () => {
      const buy = ev(20, 10, { kind: 'delta', quantity: 1000 })
      const raj = ev(21, 19, { kind: 'delta', quantity: -200, created_by: 'raj' })
      const amma = ev(21, 19, { kind: 'delta', quantity: -300, created_by: 'amma' })
      expect(computeStock(tomato, [buy, raj, amma]).total).toBe(500)
      // Arrival order doesn't matter.
      expect(computeStock(tomato, [amma, buy, raj]).total).toBe(500)
    })

    test('a change made offline counts at the time it was made, not when it synced', () => {
      const buy = ev(20, 10, { kind: 'delta', quantity: 1000 })
      const correction = ev(21, 20, { kind: 'set', quantity: 400, reason: 'correction' })
      // Used 100 g at 18:00 while offline; synced after the 20:00 correction.
      const offlineUse = { ...ev(21, 18, { kind: 'delta', quantity: -100 }), created_at: new Date(2026, 8, 21, 21).toISOString() }
      // The correction came after the use, so it wins: 400 g.
      expect(computeStock(tomato, [buy, correction, offlineUse]).total).toBe(400)
    })

    test('of two corrections, the later one wins', () => {
      const s = computeStock(tomato, [
        ev(20, 10, { kind: 'delta', quantity: 1000 }),
        ev(21, 10, { kind: 'set', quantity: 600, reason: 'correction' }),
        ev(21, 11, { kind: 'set', quantity: 400, reason: 'correction' }),
      ])
      expect(s.total).toBe(400)
    })
  })

  describe('whole and opened (coconut)', () => {
    test('opening moves one from whole to opened, which keeps for 3 days', () => {
      const s = computeStock(coconut, [
        ev(20, 10, { kind: 'delta', quantity: 3 }),
        ev(22, 8, { kind: 'open', quantity: 1 }),
      ])
      expect([s.whole, s.opened, s.total]).toEqual([2, 1, 3])
      expect(s.batches.find((b) => b.form === 'opened')?.expiresOn).toBe('2026-09-25')
    })

    test('using opened coconut takes from opened only', () => {
      const s = computeStock(coconut, [
        ev(20, 10, { kind: 'delta', quantity: 2 }),
        ev(22, 8, { kind: 'open', quantity: 1 }),
        ev(22, 12, { kind: 'delta', quantity: -0.5, form: 'opened' }),
      ])
      expect([s.whole, s.opened]).toEqual([1, 0.5])
    })

    test("can't open what isn't there", () => {
      const s = computeStock(coconut, [ev(22, 8, { kind: 'open', quantity: 1 })])
      expect(s.total).toBe(0)
    })
  })

  test('lastEvent is the newest by time', () => {
    const a = ev(20, 10, { kind: 'delta', quantity: 1 })
    const b = ev(21, 10, { kind: 'delta', quantity: 1 })
    expect(computeStock(tomato, [b, a]).lastEvent?.id).toBe(b.id)
  })
})
