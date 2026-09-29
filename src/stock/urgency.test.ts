import { describe, expect, test } from 'vitest'
import type { Batch, Stock } from './computeStock.ts'
import { isShown, urgencyOf } from './urgency.ts'
import { daysLeft } from './usage.ts'

const now = new Date(2026, 8, 29, 20) // Tuesday evening
const at = (day: number) => new Date(2026, 8, day, 12).toISOString()

function stock(total: number, expiries: (string | null)[] = []): Stock {
  const batches: Batch[] = expiries.map((e, i) => ({ id: `b${i}`, form: 'whole', remaining: total / expiries.length, expiresOn: e, addedAt: '' }))
  return { total, whole: total, opened: 0, batches, usage: [], lastEvent: null }
}

const veg = { is_staple: false, low_threshold: null }
const onion = { is_staple: true, low_threshold: 500 }

describe('urgencyOf', () => {
  test.each([
    ['2026-09-28', 'red', 'Past its date · check'],
    ['2026-09-29', 'red', 'Use today'],
    ['2026-09-30', 'amber', 'Use by tomorrow'],
    ['2026-10-01', 'amber', 'Use in 2 days'],
    ['2026-10-04', 'green', 'Fresh · 5 days'],
  ] as const)('expiring %s → %s, "%s"', (expiry, level, label) => {
    expect(urgencyOf(veg, stock(500, [expiry]), null, now)).toMatchObject({ level, label })
  })

  test('the batch expiring first decides', () => {
    expect(urgencyOf(veg, stock(1000, ['2026-09-29', '2026-10-10']), null, now).label).toBe('Use today')
  })

  test('staples: out is red; a few days left is amber; plenty is fine', () => {
    expect(urgencyOf(onion, stock(0), null, now)).toMatchObject({ group: 'running_low', level: 'red', label: 'Out' })
    expect(urgencyOf(onion, stock(2000, [null]), 2.4, now)).toMatchObject({ group: 'running_low', label: 'About 2 days left' })
    expect(urgencyOf(onion, stock(2000, [null]), 12, now)).toMatchObject({ group: 'fine', label: 'In stock' })
  })

  test('without enough history, the low threshold applies', () => {
    expect(urgencyOf(onion, stock(400, [null]), null, now)).toMatchObject({ group: 'running_low', label: 'Running low' })
    expect(urgencyOf(onion, stock(900, [null]), null, now).group).toBe('fine')
  })

  test('things that keep, with no threshold, are simply in stock', () => {
    expect(urgencyOf(veg, stock(5000, [null]), null, now)).toMatchObject({ group: 'fine', level: 'green', label: 'In stock' })
  })
})

describe('isShown', () => {
  test('items in stock and staples are listed; empty non-staples and archived items are not', () => {
    expect(isShown({ is_staple: false, archived: false }, stock(100))).toBe(true)
    expect(isShown({ is_staple: false, archived: false }, stock(0))).toBe(false)
    expect(isShown({ is_staple: true, archived: false }, stock(0))).toBe(true)
    expect(isShown({ is_staple: true, archived: true }, stock(100))).toBe(false)
  })
})

describe('daysLeft', () => {
  test('from the recent rate of use, less a buffer for untracked use', () => {
    // 2.8 kg used over the last 28 days = 100 g a day; 1 kg left → 10 days, less 20% = 8.
    const usage = [4, 11, 18, 25].map((d) => ({ at: at(d), amount: 700 }))
    expect(daysLeft(1000, usage, at(1), now)).toBeCloseTo(8, 0)
  })

  test('needs a week of history and some use', () => {
    expect(daysLeft(1000, [{ at: at(27), amount: 100 }], at(26), now)).toBeNull()
    expect(daysLeft(1000, [], at(1), now)).toBeNull()
    expect(daysLeft(1000, [], null, now)).toBeNull()
  })

  test('use older than four weeks is ignored', () => {
    const usage = [{ at: new Date(2026, 7, 1).toISOString(), amount: 5000 }, { at: at(20), amount: 280 }]
    // Only the 280 g counts: 10 g a day over 28 days; 100 g left → 10 days, less 20% = 8.
    expect(daysLeft(100, usage, new Date(2026, 6, 1).toISOString(), now)).toBeCloseTo(8, 0)
  })
})
