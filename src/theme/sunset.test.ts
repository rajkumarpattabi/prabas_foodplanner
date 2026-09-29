import { describe, expect, test } from 'vitest'
import { isAfterDark, nextSunChange, sunTimes } from './sunset.ts'

// Tests run with TZ=Asia/Kolkata (see vitest.config.ts), so local times are IST.
const ist = (iso: string) => new Date(`${iso}+05:30`)
const minutesApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000

describe('sunTimes in Chennai', () => {
  // Reference times from published Chennai almanacs, rounded to the minute.
  const cases = [
    { day: '2026-06-21', sunrise: '05:43', sunset: '18:37' },
    { day: '2026-09-29', sunrise: '05:58', sunset: '18:01' },
    { day: '2026-12-21', sunrise: '06:25', sunset: '17:47' },
  ]
  for (const c of cases) {
    test(c.day, () => {
      const t = sunTimes(ist(`${c.day}T12:00:00`))!
      expect(minutesApart(t.sunrise, ist(`${c.day}T${c.sunrise}:00`))).toBeLessThan(3)
      expect(minutesApart(t.sunset, ist(`${c.day}T${c.sunset}:00`))).toBeLessThan(3)
    })
  }

  test('returns null when the sun does not set', () => {
    expect(sunTimes(ist('2026-06-21T12:00:00'), { lat: 80, lng: 0 })).toBeNull()
  })
})

describe('isAfterDark', () => {
  test('light at midday, dark in the evening and before dawn', () => {
    expect(isAfterDark(ist('2026-09-29T12:00:00'))).toBe(false)
    expect(isAfterDark(ist('2026-09-29T19:00:00'))).toBe(true)
    expect(isAfterDark(ist('2026-09-29T04:30:00'))).toBe(true)
  })
})

describe('nextSunChange', () => {
  test('before dawn, the next change is sunrise today', () => {
    const next = nextSunChange(ist('2026-09-29T04:00:00'))
    expect(minutesApart(next, ist('2026-09-29T05:58:00'))).toBeLessThan(3)
  })
  test('during the day, the next change is sunset today', () => {
    const next = nextSunChange(ist('2026-09-29T12:00:00'))
    expect(minutesApart(next, ist('2026-09-29T18:01:00'))).toBeLessThan(3)
  })
  test('after sunset, the next change is sunrise tomorrow', () => {
    const next = nextSunChange(ist('2026-09-29T21:00:00'))
    expect(minutesApart(next, ist('2026-09-30T05:58:00'))).toBeLessThan(3)
  })
})
