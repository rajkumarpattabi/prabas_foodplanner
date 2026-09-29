import { expect, test } from 'vitest'
import { resolveTheme } from './theme.ts'

const noon = new Date('2026-09-29T12:00:00+05:30')
const night = new Date('2026-09-29T21:00:00+05:30')

test('auto follows the sun', () => {
  expect(resolveTheme('auto', noon)).toBe('light')
  expect(resolveTheme('auto', night)).toBe('dark')
})

test('manual override ignores the sun', () => {
  expect(resolveTheme('dark', noon)).toBe('dark')
  expect(resolveTheme('light', night)).toBe('light')
})
