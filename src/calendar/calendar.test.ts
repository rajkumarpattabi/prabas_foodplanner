import { describe, expect, test } from 'vitest'
import { addDays, daysBetween, parseLocalDate } from '../lib/dates.ts'
import { dayContext } from './dayContext.ts'
import { nonVegTargets } from './rhythm.ts'
import { isRestricted, restrictionsOn } from './rules.ts'
import type { CalendarDay, CalendarType } from './types.ts'

let n = 0
function day(type: CalendarType, date: string, extra: Partial<CalendarDay> = {}): CalendarDay {
  return {
    id: `c${++n}`,
    household_id: 'hh',
    date,
    end_date: null,
    type,
    label: '',
    verified: true,
    note: null,
    created_by: null,
    created_at: '',
    updated_by: null,
    updated_at: '',
    ...extra,
  }
}

const PURATASI_2026 = day('puratasi', '2026-09-18', { end_date: '2026-10-17' })
const targets = (from: string, to: string, days: CalendarDay[]) => Object.fromEntries(nonVegTargets(from, to, days))
const weekday = (d: string) => parseLocalDate(d).toLocaleDateString('en-GB', { weekday: 'short' })

describe('restricted days', () => {
  test('every Saturday, and Amavasai, Kiruthigai, family days and all of Puratasi', () => {
    const days = [day('amavasai', '2026-11-09'), day('kiruthigai', '2026-11-26'), day('family_custom', '2026-12-02', { label: "Thatha's day" }), PURATASI_2026]
    expect(isRestricted('2026-11-14', days)).toBe(true) // a Saturday
    expect(isRestricted('2026-11-09', days)).toBe(true)
    expect(isRestricted('2026-11-26', days)).toBe(true)
    expect(isRestricted('2026-10-01', days)).toBe(true) // inside Puratasi
    expect(isRestricted('2026-10-18', days)).toBe(false) // the day after
    expect(restrictionsOn('2026-12-02', days).map((r) => r.label)).toEqual(["Thatha's day"])
  })

  test('the most telling reason comes first', () => {
    // 10 Oct 2026: a Saturday, an Amavasai, and in Puratasi.
    const days = [day('amavasai', '2026-10-10'), PURATASI_2026]
    expect(restrictionsOn('2026-10-10', days).map((r) => r.kind)).toEqual(['puratasi', 'amavasai', 'saturday'])
  })
})

describe('the non-veg rhythm', () => {
  test('a normal week: Wednesday and Sunday', () => {
    expect(targets('2026-11-16', '2026-11-22', [])).toEqual({ '2026-11-18': 'midweek', '2026-11-22': 'sunday' })
  })

  test('Amavasai on Wednesday moves the midweek day to Thursday', () => {
    expect(targets('2026-11-16', '2026-11-22', [day('amavasai', '2026-11-18')])).toEqual({ '2026-11-19': 'midweek', '2026-11-22': 'sunday' })
  })

  test('Wednesday and Thursday both out: Tuesday, still two days from Sunday', () => {
    const t = targets('2026-11-16', '2026-11-22', [day('amavasai', '2026-11-18'), day('kiruthigai', '2026-11-19')])
    expect(t).toEqual({ '2026-11-17': 'midweek', '2026-11-22': 'sunday' })
  })

  test('a restricted Sunday moves to Monday (Saturday never), and the next midweek keeps its distance', () => {
    expect(targets('2026-11-22', '2026-11-29', [day('kiruthigai', '2026-11-22')])).toEqual({
      '2026-11-23': 'sunday',
      '2026-11-25': 'midweek',
      '2026-11-29': 'sunday',
    })
  })

  test('Sunday and Monday both out: Tuesday, and that week’s midweek moves to Thursday', () => {
    const t = targets('2026-11-22', '2026-11-29', [day('kiruthigai', '2026-11-22'), day('family_custom', '2026-11-23')])
    expect(t).toEqual({ '2026-11-24': 'sunday', '2026-11-26': 'midweek', '2026-11-29': 'sunday' })
  })

  test('Puratasi pauses it; the first allowed day after is a non-veg day to mark the return', () => {
    const t = targets('2026-09-14', '2026-10-25', [PURATASI_2026])
    expect(Object.keys(t).filter((d) => d >= '2026-09-18' && d <= '2026-10-17')).toEqual([])
    expect(t['2026-10-18']).toBe('return') // Sunday 18 Oct
    expect(t['2026-10-21']).toBe('midweek')
    expect(t['2026-10-25']).toBe('sunday')
  })

  test('a Sunday inside Puratasi is skipped, not moved to just before it', () => {
    // Puratasi 2026 starts Friday 18 Sep; Sunday 20 Sep must not become Thursday 17 Sep.
    expect(targets('2026-09-07', '2026-09-20', [PURATASI_2026])).toEqual({
      '2026-09-09': 'midweek',
      '2026-09-13': 'sunday',
      '2026-09-16': 'midweek',
    })
  })

  test('Puratasi ending on a Friday: Saturday is out, so the return is Sunday', () => {
    const t = targets('2027-10-11', '2027-10-20', [day('puratasi', '2027-09-18', { end_date: '2027-10-15' })])
    expect(t['2027-10-17']).toBe('return')
    expect(weekday('2027-10-17')).toBe('Sun')
  })

  test('across a year: never on a restricted day, always two days apart, twice a week outside Puratasi', () => {
    const days = [
      PURATASI_2026,
      ...['2026-01-18', '2026-02-17', '2026-03-18', '2026-03-19', '2026-04-16', '2026-05-16', '2026-06-14', '2026-07-14'].map((d) => day('amavasai', d)),
      ...['2026-01-28', '2026-02-24', '2026-03-24', '2026-04-20', '2026-05-18'].map((d) => day('kiruthigai', d)),
    ]
    const all = [...nonVegTargets('2026-01-05', '2026-12-27', days).keys()]
    for (const d of all) expect(isRestricted(d, days), d).toBe(false)
    for (let i = 1; i < all.length; i++) expect(daysBetween(all[i - 1], all[i]), `${all[i - 1]} → ${all[i]}`).toBeGreaterThanOrEqual(2)
    // Never three packed into five days (as the week after Puratasi once was: 18, 20, 22 Oct).
    // A moved Sunday on Monday, then Wednesday and Sunday, is fine: each is its own week's.
    for (let i = 2; i < all.length; i++) expect(daysBetween(all[i - 2], all[i]), `${all[i - 2]} … ${all[i]}`).toBeGreaterThan(4)
    const outsidePuratasi = all.filter((d) => d < '2026-09-18' || d > '2026-10-17')
    const weeks = (daysBetween('2026-01-05', '2026-12-27') + 1) / 7 - 30 / 7
    expect(outsidePuratasi.length).toBeGreaterThanOrEqual(Math.floor(weeks * 2) - 2)
  })
})

describe('the Plan chip', () => {
  const days = [day('amavasai', '2026-11-09', { verified: false }), PURATASI_2026]

  test.each([
    ['2026-11-14', 'Saturday · veg only', true],
    ['2026-10-01', 'Puratasi · veg only', true],
    ['2026-10-10', 'Puratasi · veg only', true],
    ['2026-11-09', 'Amavasai (check date) · veg only', true],
    ['2026-11-15', 'Non-veg day', false],
    ['2026-10-18', 'Non-veg day · Puratasi is over', false],
    ['2026-11-17', null, false],
  ])('%s → %s', (date, chip, vegOnly) => {
    const c = dayContext(date, days)
    expect(c.chip).toBe(chip)
    expect(c.vegOnly).toBe(vegOnly)
  })

  test('a non-veg day is never a veg-only day, whatever the window', () => {
    for (let d = '2026-11-01'; d <= '2026-12-31'; d = addDays(d, 1)) {
      const c = dayContext(d, days)
      expect(c.vegOnly && c.nonVegDay).toBe(false)
    }
  })
})
