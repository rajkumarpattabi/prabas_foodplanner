import { describe, expect, test } from 'vitest'
import type { CalendarDay } from '../calendar/types.ts'
import type { Dish, DishTag, Ingredient } from '../dishes/types.ts'
import { addDays } from '../lib/dates.ts'
import type { Combo } from '../plan/combos.ts'
import { dishHistory } from '../plan/history.ts'
import { scoreCombo, WEIGHTS, type PlanContext } from '../plan/score.ts'
import type { MealRecord } from '../plan/types.ts'
import type { Item, StockEvent } from '../stock/types.ts'
import { stockRow } from '../stock/view.ts'
import { balance, cookedMeals, nutrition, weekStart, type Nutrition } from './balance.ts'
import { cover } from './groups.ts'
import { MAX_NUDGES, shoppingNudges } from './nudges.ts'
import { swapIdea, swapText } from './swaps.ts'

const TODAY = '2026-10-14' // Wednesday
const NOW = new Date(2026, 9, 14, 18)

const item = (id: string, category: Item['category']): Item => ({
  id,
  household_id: 'hh',
  name_ta: `${id}-ta`,
  name_en: id,
  aliases: [],
  category,
  unit: 'g',
  display_unit: 'g',
  shelf_life_days: null,
  is_staple: false,
  low_threshold: null,
  piece_weight_g: null,
  has_opened_form: false,
  opened_shelf_life_days: null,
  step: 250,
  archived: false,
  created_by: null,
  created_at: '',
  updated_by: null,
  updated_at: '',
})
const ITEMS = [
  item('rice', 'grain'),
  item('idli_rice', 'grain'),
  item('ragi', 'grain'),
  item('toor', 'dal'),
  item('chana', 'dal'),
  item('brinjal', 'vegetable'),
  item('carrot', 'vegetable'),
  item('okra', 'vegetable'),
  item('keerai', 'greens'),
  item('murungai_keerai', 'greens'),
  item('ayila', 'fish'),
  item('curd', 'dairy'),
]
const itemsById = new Map(ITEMS.map((i) => [i.id, i]))

const dish = (id: string, type: Dish['type'], tags: DishTag[], ingredients: string[], extra: Partial<Dish> = {}): Dish => ({
  id,
  household_id: 'hh',
  catalog_key: id,
  name_ta: `${id}-ta`,
  name_en: id,
  aliases: [],
  type,
  meals: ['breakfast', 'lunch', 'dinner'],
  is_veg: true,
  tags,
  ingredients: ingredients.map((item_id): Ingredient => ({ item_id, quantity: 100 })),
  side_ids: [],
  prep_plan: null,
  uses_prepared: [],
  is_favourite: false,
  is_kids_favourite: false,
  dont_suggest: false,
  notes: null,
  created_by: null,
  created_at: '',
  updated_by: null,
  updated_at: '',
  ...extra,
})
const D = {
  dosa: dish('dosa', 'tiffin', [], ['idli_rice']),
  adai: dish('adai', 'tiffin', ['protein', 'legume'], ['rice', 'toor']),
  pesarattu: dish('pesarattu', 'tiffin', ['protein', 'legume'], ['toor'], { is_kids_favourite: true }),
  ragi_dosa: dish('ragi_dosa', 'tiffin', ['millet'], ['ragi']),
  sambar: dish('sambar', 'sambar', ['protein', 'legume'], ['toor', 'brinjal']),
  poriyal: dish('poriyal', 'poriyal', [], ['carrot']),
  masiyal: dish('masiyal', 'kootu', ['greens'], ['keerai']),
  murungai: dish('murungai', 'poriyal', [], ['murungai_keerai'], { is_kids_favourite: true }),
  meen: dish('meen', 'nonveg_gravy', ['protein', 'fish'], ['ayila'], { is_veg: false }),
  curd_rice: dish('curd_rice', 'variety_rice', ['curd'], ['rice', 'curd']),
  sundal: dish('sundal', 'snack', ['protein', 'legume'], ['chana']),
}
const dishesById = new Map(Object.values(D).map((d) => [d.id, d]))

let n = 0
const cooked = (date: string, ...dishes: Dish[]): MealRecord => ({
  id: `m${++n}`,
  household_id: 'hh',
  date,
  meal: (['breakfast', 'lunch', 'dinner'] as const)[n % 3],
  dish_ids: dishes.map((d) => d.id),
  dish_names: [],
  status: 'cooked',
  cooked_by: 'u1',
  cooked_at: '',
  created_by: 'u1',
  created_at: '',
  updated_by: 'u1',
  updated_at: '',
})
/** One meal a day from `from` days ago up to today. */
const daily = (days: number, ...dishes: Dish[]) => Array.from({ length: days }, (_, i) => cooked(addDays(TODAY, -i), ...dishes))
const judge = (meals: MealRecord[], calendar: CalendarDay[] = []) => nutrition(cookedMeals(meals, dishesById, itemsById), TODAY, calendar)

describe('what a meal covers', () => {
  test('from tags, and from what is in it', () => {
    const c = (...ds: Dish[]) => [...cover(ds, itemsById).groups].sort()
    expect(c(D.sambar)).toEqual(['legume', 'protein', 'variety'])
    expect(c(D.masiyal)).toEqual(['greens'])
    expect(c(D.murungai)).toEqual(['greens'])
    expect(c(D.meen)).toEqual(['fish', 'protein'])
    expect(c(D.curd_rice)).toEqual(['curd'])
    expect(c(D.dosa)).toEqual([])
    expect([...cover([D.sambar, D.poriyal], itemsById).vegetables].sort()).toEqual(['brinjal', 'carrot'])
  })
})

describe('the balance', () => {
  test('meals, days and different vegetables, against targets for the period', () => {
    const meals = [cooked('2026-10-12', D.sambar, D.poriyal), cooked('2026-10-12', D.dosa), cooked('2026-10-13', D.masiyal), cooked('2026-10-01', D.sambar)]
    const week = balance(cookedMeals(meals, dishesById, itemsById), weekStart(TODAY), TODAY)
    expect(week).toMatchObject({ from: '2026-10-12', to: TODAY, meals: 3 })
    expect(week.stats.legume).toMatchObject({ meals: 1, days: 1, last: '2026-10-12', value: 1, target: 2, level: 'amber' })
    expect(week.stats.greens).toMatchObject({ days: 1, target: 1, level: 'green' })
    expect(week.stats.variety).toMatchObject({ distinct: 2, target: 6, level: 'red' })
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // a Sunday belongs to the week before
  })
})

describe('real gaps only', () => {
  test('not enough cooking logged: no gaps at all', () => {
    expect(judge(daily(9, D.dosa))).toMatchObject({ enough: false, gaps: [] })
    // Ten meals, but all in the last five days.
    expect(judge([...daily(5, D.dosa), ...daily(5, D.dosa)]).enough).toBe(false)
  })

  test('a fortnight of plain dosa: legumes first, greens none in two weeks', () => {
    const { gaps, enough } = judge(daily(14, D.dosa))
    expect(enough).toBe(true)
    expect(gaps.map((g) => g.group)).toEqual(['legume', 'protein', 'greens', 'variety', 'millet', 'fish', 'curd'])
    expect(gaps[0]).toEqual({ group: 'legume', size: 1, daysSince: null })
  })

  test('targets met: no gaps', () => {
    const good = [
      ...daily(14, D.sambar, D.poriyal),
      ...daily(5, D.masiyal),
      ...daily(5, D.curd_rice),
      ...daily(2, D.ragi_dosa),
      ...daily(2, D.meen),
      ...['okra', 'carrot', 'brinjal', 'keerai'].map(() => cooked(TODAY, D.poriyal)),
    ]
    const extra = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((v) => {
      itemsById.set(v, item(v, 'vegetable'))
      return cooked('2026-10-10', dish(`d-${v}`, 'poriyal', [], [v]))
    })
    for (const m of extra) dishesById.set(m.dish_ids[0], dish(m.dish_ids[0], 'poriyal', [], [m.dish_ids[0].slice(2)]))
    expect(judge([...good, ...extra]).gaps).toEqual([])
  })

  test('greens had, but not for six days: still a gap', () => {
    const meals = [...daily(14, D.sambar), cooked('2026-10-08', D.masiyal), cooked('2026-10-07', D.masiyal), cooked('2026-10-06', D.masiyal), cooked('2026-10-05', D.masiyal)]
    expect(judge(meals).gaps.find((g) => g.group === 'greens')).toEqual({ group: 'greens', size: 0.5, daysSince: 6 })
  })

  test('fish is no gap in Puratasi', () => {
    const puratasi = { id: 'p', household_id: 'hh', date: '2026-09-18', end_date: '2026-10-17', type: 'puratasi', label: '', verified: true, note: null } as CalendarDay
    expect(judge(daily(14, D.dosa), [puratasi]).gaps.some((g) => g.group === 'fish')).toBe(false)
  })
})

const combo = (main: Dish, sides: Dish[] = []): Combo => ({ main, base: null, sides, leftover: null })
const ctx = (nutr: Nutrition, extra: Partial<PlanContext> = {}): PlanContext => ({
  today: TODAY,
  itemsById,
  stockTotals: new Map(),
  urgentItemIds: new Set(),
  trackedItemIds: new Set(),
  nonVegDay: false,
  history: new Map(),
  itemName: (i) => i.name_en,
  dishName: (d) => d.name_en,
  nutrition: nutr,
  ...extra,
})

describe('suggestions fill the gaps', () => {
  const dosaFortnight = judge(daily(14, D.dosa))

  test('sambar fills legumes: a lift, and the why line says so', () => {
    const s = scoreCombo(combo(D.sambar), ctx(dosaFortnight))
    expect(s.factors.nutrition).toBe(WEIGHTS.nutrition)
    expect(s.why).toContain('Adds legumes (none in 2 weeks)')
    expect(scoreCombo(combo(D.dosa), ctx(dosaFortnight)).factors.nutrition).toBe(0)
  })

  test('a small gap: a smaller lift, bigger on a veg-only day for veg protein', () => {
    const small: Nutrition = { gaps: [{ group: 'protein', size: 0.4, daysSince: 3 }], recentVegetables: new Set(), enough: true }
    const usual = scoreCombo(combo(D.sundal), ctx(small)).factors.nutrition
    const saturday = scoreCombo(combo(D.sundal), ctx(small, { vegOnlyDay: true })).factors.nutrition
    expect(usual).toBeCloseTo(0.6)
    expect(saturday).toBeCloseTo(0.9)
  })

  test('a vegetable not had lately counts as variety', () => {
    const v: Nutrition = { gaps: [{ group: 'variety', size: 0.5, daysSince: 1 }], recentVegetables: new Set(['carrot']), enough: true }
    expect(scoreCombo(combo(D.poriyal), ctx(v)).factors.nutrition).toBe(0)
    expect(scoreCombo(combo(D.sambar), ctx(v)).why).toContain("A vegetable you haven't had lately")
  })
})

describe('swap ideas', () => {
  const dosaFortnight = judge(daily(14, D.dosa))
  const meals = [...daily(14, D.dosa), cooked('2026-09-20', D.adai), cooked('2026-09-21', D.adai)]
  const input = (c: Combo, extra = {}) => ({
    combo: c,
    meal: 'breakfast' as const,
    nutrition: dosaFortnight,
    dishes: Object.values(D),
    history: dishHistory(meals),
    itemsById,
    vegOnly: false,
    ...extra,
  })

  test('plain dosa: a familiar tiffin with legumes, kids’ favourites first', () => {
    const idea = swapIdea(input(combo(D.dosa)))
    expect(idea).toMatchObject({ kind: 'main', dish: { id: 'pesarattu' }, group: 'legume' })
    expect(swapText(idea!, (d) => d.name_en)).toBe('More legumes: try pesarattu')
    expect(idea!.combo.main.id).toBe('pesarattu')
  })

  test('only familiar dishes: never cooked and not a favourite is not offered', () => {
    const noKids = Object.values(D).map((d) => (d.id === 'pesarattu' ? { ...d, is_kids_favourite: false } : d))
    expect(swapIdea(input(combo(D.dosa), { dishes: noKids }))?.dish.id).toBe('adai')
  })

  test('no familiar main: add a side for protein instead', () => {
    const others = Object.values(D).filter((d) => d.id !== 'adai' && d.id !== 'pesarattu')
    const idea = swapIdea(input(combo(D.dosa), { dishes: others }))
    expect(idea).toMatchObject({ kind: 'side', dish: { id: 'sundal' } })
    expect(idea!.combo.sides.map((s) => s.id)).toEqual(['sundal'])
    // Dosa with a poriyal brings in a vegetable not had lately: that's a gap filled already.
    expect(swapIdea(input(combo(D.dosa, [D.poriyal]), { dishes: others }))).toBeNull()
    expect(swapText(idea!, (d) => d.name_en)).toBe('Add sundal for legumes')
  })

  test('a combo that already fills a gap needs no swap', () => {
    expect(swapIdea(input(combo(D.adai)))).toBeNull()
  })
})

describe('shopping nudges', () => {
  let t = 0
  const ev = (item_id: string, quantity: number): StockEvent => ({
    id: `e-${item_id}-${++t}`,
    household_id: 'hh',
    item_id,
    kind: 'delta',
    quantity,
    reason: quantity > 0 ? 'bought' : 'cooked',
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: new Date(Date.UTC(2026, 9, 1, 10, t)).toISOString(),
    created_by: 'u1',
    created_at: new Date(Date.UTC(2026, 9, 1, 10, t)).toISOString(),
  })
  const rows = (stock: Record<string, StockEvent[]> = {}) => ITEMS.map((i) => stockRow(i, stock[i.id] ?? [], NOW))
  const input = (extra = {}) => ({
    nutrition: judge(daily(14, D.dosa)),
    today: TODAY,
    calendar: [] as CalendarDay[],
    rows: rows(),
    listed: new Set<string>(),
    dishes: Object.values(D),
    history: dishHistory([]),
    ...extra,
  })

  test('never more than two, for the biggest gaps, each with an item and a dish idea', () => {
    const nudges = shoppingNudges(input())
    expect(nudges).toHaveLength(MAX_NUDGES)
    expect(nudges.map((x) => [x.group, x.text, x.item.id, x.dish?.id])).toEqual([
      // Toor comes with pesarattu, a kids' favourite.
      ['legume', 'Few legumes this fortnight.', 'toor', 'pesarattu'],
      ['greens', 'No keerai in 2 weeks.', 'murungai_keerai', 'murungai'],
    ])
  })

  test('not for a gap already in hand: something that fills it is in stock or on the list', () => {
    // A dal in stock (legumes in hand), murungai keerai on the list (greens in hand).
    const nudges = shoppingNudges(input({ rows: rows({ chana: [ev('chana', 500)] }), listed: new Set(['murungai_keerai']) }))
    expect(nudges.map((x) => [x.group, x.item.id])).toEqual([
      ['variety', 'brinjal'],
      ['millet', 'ragi'],
    ])
  })

  test('the item bought most often comes first', () => {
    const r = rows({ keerai: [ev('keerai', 1), ev('keerai', -1), ev('keerai', 1), ev('keerai', -1)] })
    const greens = shoppingNudges(input({ rows: r, dishes: Object.values(D).filter((d) => d.id !== 'murungai') }))
    expect(greens.find((x) => x.group === 'greens')?.item.id).toBe('keerai')
  })

  test('no gaps, no nudges', () => {
    expect(shoppingNudges(input({ nutrition: { gaps: [], recentVegetables: new Set(), enough: true } }))).toEqual([])
  })
})
