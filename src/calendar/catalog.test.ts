/// <reference types="node" />
// This test reads the catalogue files from disk, so it needs Node types.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { calendarToMarkdown, calendarToSql, parseCalendarCatalog } from './catalog.ts'
import { dayContext } from './dayContext.ts'
import { nonVegTargets } from './rhythm.ts'
import { isRestricted } from './rules.ts'
import type { CalendarDay } from './types.ts'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const catalogue = parseCalendarCatalog(read('supabase/seed/calendar.psv'))
const asDays: CalendarDay[] = catalogue.map((d, i) => ({
  id: `c${i}`,
  household_id: 'hh',
  date: d.date,
  end_date: d.end_date,
  type: d.type,
  label: d.label,
  verified: false,
  note: d.note,
  created_by: null,
  created_at: '',
  updated_by: null,
  updated_at: '',
}))
const weekday = (s: string) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${s}T00:00:00Z`).getUTCDay()]

describe('the starter restricted days', () => {
  test('migration 0010 and the review table are up to date (run `npm run catalog` after editing)', () => {
    expect(read('supabase/migrations/0010_calendar_dates.sql')).toBe(calendarToSql(catalogue))
    expect(read('docs/CALENDAR.md')).toBe(calendarToMarkdown(catalogue))
  })

  test('a year of Amavasai and Kiruthigai, and Puratasi, for 2026 and 2027', () => {
    for (const year of ['2026', '2027']) {
      const of = (t: string) => catalogue.filter((d) => d.type === t && d.date.startsWith(year)).length
      expect(of('amavasai'), `${year} Amavasai`).toBeGreaterThanOrEqual(12)
      expect(of('kiruthigai'), `${year} Kiruthigai`).toBeGreaterThanOrEqual(12)
      expect(of('puratasi'), `${year} Puratasi`).toBe(1)
    }
  })

  test('typo guard: weekdays match the ones the source pages printed', () => {
    // A few from each list, as the pages showed them.
    const printed: [string, string][] = [
      ['2026-01-18', 'Sun'],
      ['2026-05-16', 'Sat'],
      ['2026-10-10', 'Sat'],
      ['2026-12-08', 'Tue'],
      ['2027-02-06', 'Sat'],
      ['2027-08-31', 'Tue'],
      ['2027-12-27', 'Mon'],
      ['2026-01-27', 'Tue'],
      ['2026-11-24', 'Tue'],
      ['2027-01-18', 'Mon'],
      ['2027-12-11', 'Sat'],
      ['2026-09-18', 'Fri'],
      ['2026-10-17', 'Sat'],
    ]
    for (const [date, day] of printed) {
      expect(catalogue.some((d) => d.date === date || d.end_date === date), date).toBe(true)
      expect(weekday(date), date).toBe(day)
    }
  })

  test('where sources disagreed, both days are there and say so', () => {
    for (const [a, b] of [
      ['2026-03-18', '2026-03-19'],
      ['2027-09-29', '2027-09-30'],
    ]) {
      const both = catalogue.filter((d) => d.type === 'amavasai' && (d.date === a || d.date === b))
      expect(both).toHaveLength(2)
      expect(both.some((d) => d.note)).toBe(true)
    }
  })

  test('the rules hold with these dates: today (1 Oct 2026) is Puratasi, and no non-veg day is ever restricted', () => {
    expect(dayContext('2026-10-01', asDays).chip).toBe('Puratasi (check date) · veg only')
    expect(dayContext('2026-10-18', asDays).chip).toBe('Non-veg day · Puratasi is over')
    for (const d of nonVegTargets('2026-01-01', '2027-12-31', asDays).keys()) expect(isRestricted(d, asDays), d).toBe(false)
  })
})

describe('reading the file', () => {
  const header = 'date|end_date|type|label|sources|note'
  test.each([
    ['2026-02-30||amavasai||x|', "isn't a date"],
    ['2026-03-01||ekadasi||x|', 'unknown type'],
    ['2026-03-01|2026-03-02|amavasai||x|', 'only Puratasi has an end date'],
    ['2026-09-18||puratasi||x|', 'Puratasi needs an end date'],
    ['2026-09-18|2026-09-01|puratasi||x|', 'ends before it starts'],
    ['2026-03-01||amavasai|||', 'needs at least one source'],
  ])('%s is refused', (line, error) => {
    expect(() => parseCalendarCatalog(`${header}\n${line}`)).toThrow(error)
  })

  test('the same day twice is refused', () => {
    expect(() => parseCalendarCatalog(`${header}\n2026-03-01||amavasai||x|\n2026-03-01||amavasai||y|`)).toThrow('listed twice')
  })
})
