import { describe, expect, test } from 'vitest'
import { formatDay } from './dates.ts'
import { attribution, relTime } from './time.ts'

const now = new Date('2026-09-29T20:00:00Z').getTime()
const ago = (ms: number) => new Date(now - ms).toISOString()
const MIN = 60_000

describe('relTime', () => {
  test.each([
    [30_000, 'just now'],
    [10 * MIN, '10 min ago'],
    [60 * MIN, '1 hour ago'],
    [3 * 60 * MIN, '3 hours ago'],
    [24 * 60 * MIN, '1 day ago'],
    [5 * 24 * 60 * MIN, '5 days ago'],
  ])('%i ms ago → %s', (ms, text) => {
    expect(relTime(ago(ms), now)).toBe(text)
  })

  test('no time gives null', () => {
    expect(relTime(null, now)).toBeNull()
  })
})

describe('attribution', () => {
  const names = new Map([
    ['u1', 'Raj'],
    ['u2', 'Priya'],
  ])

  test('names you, a co-member, or nobody', () => {
    expect(attribution({ by: 'u1', at: ago(10 * MIN), me: 'u1', names, now })).toBe('Updated by you · 10 min ago')
    expect(attribution({ by: 'u2', at: ago(2 * 60 * MIN), me: 'u1', names, now })).toBe(
      'Updated by Priya · 2 hours ago',
    )
    expect(attribution({ by: null, at: ago(3 * 24 * 60 * MIN), me: 'u1', names, now })).toBe('Updated · 3 days ago')
    expect(attribution({ by: 'gone', at: ago(MIN), me: 'u1', names, now })).toBe('Updated · 1 min ago')
  })

  test('other verbs: planned, cooked', () => {
    expect(attribution({ by: 'u2', at: ago(10 * MIN), me: 'u1', names, now, verb: 'Planned' })).toBe('Planned by Priya · 10 min ago')
  })
})

describe('formatDay', () => {
  test('the same short month on every phone: Sep, never Sept', () => {
    expect(formatDay('2026-09-18')).toBe('18 Sep')
    expect(formatDay('2026-09-18', { weekday: true })).toBe('Fri 18 Sep')
    expect(formatDay('2027-01-07', { weekday: true })).toBe('Thu 7 Jan')
  })
})
