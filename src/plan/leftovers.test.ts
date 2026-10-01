import { describe, expect, test } from 'vitest'
import { cookedWith } from './history.ts'
import { leftoverRows } from './leftovers.ts'
import type { Leftover, MealRecord } from './types.ts'

const TODAY = '2026-10-01'

const leftover = (id: string, expires_on: string, extra: Partial<Leftover> = {}): Leftover => ({
  id,
  household_id: 'hh',
  dish_id: id,
  name_ta: id,
  name_en: id,
  meal_id: null,
  servings: 2,
  expires_on,
  eaten_at: null,
  eaten_by: null,
  created_by: 'u1',
  created_at: '',
  updated_by: null,
  updated_at: '',
  ...extra,
})

describe('Ready to eat', () => {
  test('soonest first, labelled, eaten ones gone, long-past ones gone', () => {
    const rows = leftoverRows(
      [
        leftover('later', '2026-10-04'),
        leftover('tomorrow', '2026-10-02'),
        leftover('today', '2026-10-01'),
        leftover('yesterday', '2026-09-30'),
        leftover('long_ago', '2026-09-25'),
        leftover('eaten', '2026-10-02', { eaten_at: 'x' }),
      ],
      TODAY,
    )
    expect(rows.map((r) => [r.leftover.id, r.level, r.label])).toEqual([
      ['yesterday', 'red', 'Past its date · check'],
      ['today', 'red', 'Eat today'],
      ['tomorrow', 'amber', 'Eat by tomorrow'],
      ['later', 'green', 'Good for 3 days'],
    ])
  })
})

describe('cooking history', () => {
  const meal = (date: string, m: MealRecord['meal'], dish_ids: string[], status: MealRecord['status'] = 'cooked'): MealRecord => ({
    id: `hh:${date}:${m}`,
    household_id: 'hh',
    date,
    meal: m,
    dish_ids,
    dish_names: [],
    status,
    cooked_by: 'u1',
    cooked_at: '',
    created_by: 'u1',
    created_at: '',
    updated_by: null,
    updated_at: '',
  })

  test('the cooked meals a dish was in, newest first; plans do not count', () => {
    const meals = [
      meal('2026-09-20', 'lunch', ['sambar', 'rice']),
      meal('2026-09-28', 'breakfast', ['pongal', 'sambar']),
      meal('2026-09-28', 'dinner', ['idli', 'sambar']),
      meal('2026-10-02', 'lunch', ['sambar'], 'planned'),
      meal('2026-09-25', 'lunch', ['rasam']),
    ]
    expect(cookedWith(meals, 'sambar').map((m) => m.id)).toEqual(['hh:2026-09-28:dinner', 'hh:2026-09-28:breakfast', 'hh:2026-09-20:lunch'])
  })
})
