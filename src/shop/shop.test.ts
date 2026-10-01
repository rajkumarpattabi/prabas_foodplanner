import { describe, expect, test } from 'vitest'
import type { CalendarDay } from '../calendar/types.ts'
import type { Dish, Ingredient } from '../dishes/types.ts'
import type { Combo } from '../plan/combos.ts'
import type { Item, StockEvent } from '../stock/types.ts'
import { stockRow } from '../stock/view.ts'
import { buildShoppingList, mealWhen, nonVegNudges, type ShopInput } from './build.ts'
import { shareText } from './share.ts'
import type { ShoppingItem } from './types.ts'
import { usualAmount } from './usual.ts'

const TODAY = '2026-10-05' // Monday
const NOW = new Date(2026, 9, 5, 18)

const item = (id: string, name_en: string, category: Item['category'] = 'vegetable', extra: Partial<Item> = {}): Item => ({
  id,
  household_id: 'hh',
  name_ta: `${name_en}-ta`,
  name_en,
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
  ...extra,
})

const I = {
  rice: item('rice', 'Rice', 'grain', { is_staple: true, step: 1000 }),
  toor: item('toor', 'Toor dal', 'dal', { step: 500 }),
  brinjal: item('brinjal', 'Brinjal'),
  curd: item('curd', 'Curd', 'dairy', { step: 500 }),
  chilli: item('chilli', 'Chilli powder', 'spice', { step: 100 }),
  chicken: item('chicken', 'Chicken', 'meat', { is_staple: true, step: 500 }),
  fish: item('fish', 'Fish', 'fish', { step: 500 }),
  idli_rice: item('idli_rice', 'Idli rice', 'grain', { step: 1000 }),
}

let n = 0
const bought = (itemId: string, quantity: number, at = '2026-10-01T10:00:00.000Z'): StockEvent => ({
  id: `e${++n}`,
  household_id: 'hh',
  item_id: itemId,
  kind: 'delta',
  quantity,
  reason: 'bought',
  batch_id: null,
  expires_on: null,
  form: 'whole',
  note: null,
  occurred_at: at,
  created_by: 'u1',
  created_at: at,
})

const dish = (id: string, name_en: string, ingredients: Ingredient[], extra: Partial<Dish> = {}): Dish => ({
  id,
  household_id: 'hh',
  catalog_key: id,
  name_ta: `${name_en}-ta`,
  name_en,
  aliases: [],
  type: 'tiffin',
  meals: ['breakfast', 'lunch'],
  is_veg: true,
  tags: [],
  ingredients,
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
  sambar: dish('sambar', 'Brinjal sambar', [
    { item_id: 'toor', quantity: 150 },
    { item_id: 'brinjal', quantity: 300 },
    { item_id: 'chilli', quantity: 30 },
  ]),
  dal: dish('dal', 'Dal', [{ item_id: 'toor', quantity: 200 }]),
  curdRice: dish('curd_rice', 'Curd rice', [{ item_id: 'curd', quantity: 750 }]),
  chickenCurry: dish('chicken_curry', 'Chicken curry', [{ item_id: 'chicken', quantity: 1000 }], { is_veg: false }),
  batter: dish('batter', 'Idli/dosa batter', [], {
    type: 'prepared',
    prep_plan: { stages: [{ key: 'soak', hours: 5, action: true, takes_ingredients: true }], yield: 4, unit: 'meals', keeps_days: 3, ingredients: [{ item_id: 'idli_rice', quantity: 2000 }], keep_going: true },
  }),
  dosa: dish('dosa', 'Dosa', [], { uses_prepared: [{ dish_id: 'batter', quantity: 1 }] }),
}
const combo = (main: Dish): Combo => ({ main, base: null, sides: [], leftover: null })
const meal = (main: Dish, date = TODAY, m: 'breakfast' | 'lunch' | 'dinner' = 'lunch') => ({ date, meal: m, combo: combo(main) })

function input(stock: Record<string, number> = {}, extra: Partial<ShopInput> = {}): ShopInput {
  const rows = Object.values(I).map((i) => stockRow(i, stock[i.id] ? [bought(i.id, stock[i.id])] : [], NOW))
  return {
    today: TODAY,
    rows,
    trackedItemIds: new Set(),
    planned: [],
    maybe: [],
    batches: [],
    preparedCovered: new Set(),
    dishesById: new Map(Object.values(D).map((d) => [d.id, d])),
    shopping: [],
    calendar: [],
    dishName: (d) => d.name_en,
    personName: (id) => (id === 'u1' ? 'you' : 'Amma'),
    ...extra,
  }
}
const lines = (i: ShopInput) => buildShoppingList(i).map((l) => ({ id: l.item.id, section: l.section, reasons: l.reasons, quantity: l.quantity, level: l.level }))
const STOCKED = { rice: 5000, chicken: 1000 }

describe('running low', () => {
  test('a staple that is out, with why', () => {
    expect(lines(input({ chicken: 1000 }))).toEqual([{ id: 'rice', section: 'low', reasons: ['Out'], quantity: null, level: 'red' }])
  })
})

describe('for planned meals', () => {
  test('what is short after stock, added up across meals, each meal named', () => {
    const i = input({ ...STOCKED, toor: 100 }, { planned: [meal(D.sambar), meal(D.dal, '2026-10-06', 'dinner')] })
    expect(lines(i)).toEqual([
      { id: 'brinjal', section: 'planned', reasons: ["For Brinjal sambar · today's lunch"], quantity: 300, level: 'red' },
      { id: 'toor', section: 'planned', reasons: ["For Brinjal sambar · today's lunch", "For Dal · tomorrow's dinner"], quantity: 250, level: 'red' },
    ])
  })

  test('nothing when stock covers it; spices only once tracked', () => {
    expect(lines(input({ ...STOCKED, toor: 500, brinjal: 500 }, { planned: [meal(D.sambar)] }))).toEqual([])
    const tracked = input({ ...STOCKED, toor: 500, brinjal: 500 }, { planned: [meal(D.sambar)], trackedItemIds: new Set(['chilli']) })
    expect(lines(tracked).map((l) => l.id)).toEqual(['chilli'])
  })

  test('later days are calmer: amber tomorrow, green after', () => {
    const later = (date: string) => lines(input(STOCKED, { planned: [meal(D.curdRice, date)] }))[0].level
    expect(later('2026-10-06')).toBe('amber')
    expect(later('2026-10-07')).toBe('green')
    expect(mealWhen('2026-10-07', 'breakfast', TODAY)).toBe('Wed breakfast')
  })

  test('running low and needed: one line, in the more urgent section, with both reasons', () => {
    const i = input({ chicken: 1000 }, { planned: [meal(dish('pongal', 'Pongal', [{ item_id: 'rice', quantity: 400 }]))] })
    expect(lines(i)).toEqual([{ id: 'rice', section: 'low', reasons: ['Out', "For Pongal · today's lunch"], quantity: 400, level: 'red' }])
  })

  test('dosa with no batter ready or under way needs the batter’s rice; with one, nothing', () => {
    const i = input(STOCKED, { planned: [meal(D.dosa, '2026-10-06', 'breakfast')] })
    expect(lines(i)).toEqual([{ id: 'idli_rice', section: 'planned', reasons: ["For Idli/dosa batter, for Dosa · tomorrow's breakfast"], quantity: 2000, level: 'amber' }])
    expect(lines({ ...i, preparedCovered: new Set(['batter']) })).toEqual([])
  })

  test('a batch still to soak', () => {
    const i = input(STOCKED, { batches: [{ label: 'Idli/dosa batter · soak 4 pm', date: TODAY, ingredients: [{ item_id: 'idli_rice', quantity: 2000 }] }] })
    expect(lines(i)[0]).toMatchObject({ id: 'idli_rice', reasons: ['For Idli/dosa batter · soak 4 pm'], quantity: 2000 })
  })
})

describe('might need', () => {
  test('a likely meal’s needs beyond the planned ones', () => {
    const i = input({ ...STOCKED, curd: 600 }, {
      planned: [meal(dish('raita', 'Raita', [{ item_id: 'curd', quantity: 500 }]))],
      maybe: [meal(D.curdRice, '2026-10-06')],
    })
    // Planned needs 500 of the 600; curd rice would need 750 more, so 650 short.
    expect(lines(i)).toEqual([{ id: 'curd', section: 'maybe', reasons: ["For Curd rice · if you cook it tomorrow's lunch"], quantity: 650, level: 'green' }])
  })

  test('short for both: the planned shortfall, plus all the likely meal needs, on one line', () => {
    const i = input({ ...STOCKED, curd: 300 }, {
      planned: [meal(dish('raita', 'Raita', [{ item_id: 'curd', quantity: 500 }]))],
      maybe: [meal(D.curdRice, '2026-10-06')],
    })
    expect(lines(i)).toEqual([
      { id: 'curd', section: 'planned', reasons: ["For Raita · today's lunch", "For Curd rice · if you cook it tomorrow's lunch"], quantity: 950, level: 'red' },
    ])
  })
})

describe('veg-only days', () => {
  const puratasi: CalendarDay = {
    id: 'p',
    household_id: 'hh',
    date: '2026-09-18',
    end_date: '2026-10-17',
    type: 'puratasi',
    label: '',
    verified: true,
    note: null,
    created_by: null,
    created_at: '',
    updated_by: null,
    updated_at: '',
  }
  test('in Puratasi, meat and fish are never missing, not even a staple that is out', () => {
    const i = input({ rice: 5000 }, { calendar: [puratasi], planned: [meal(D.chickenCurry, '2026-10-06')] })
    expect(lines(i)).toEqual([])
    expect(lines({ ...i, calendar: [] }).map((l) => l.id)).toEqual(['chicken'])
  })
  test('a non-veg meal planned on a Saturday lists no meat', () => {
    expect(lines(input(STOCKED, { planned: [meal(D.chickenCurry, '2026-10-10')] }))).toEqual([])
  })
  test('but something added by hand stays', () => {
    const want = row({ item_id: 'fish' })
    expect(lines(input(STOCKED, { calendar: [puratasi], shopping: [want] })).map((l) => l.id)).toEqual(['fish'])
  })
})

function row(extra: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: `s-${extra.item_id}-${extra.kind ?? 'want'}`,
    household_id: 'hh',
    item_id: 'brinjal',
    kind: 'want',
    quantity: null,
    skip_until: null,
    section: null,
    done_at: null,
    done_by: null,
    created_by: 'u2',
    created_at: '',
    updated_by: null,
    updated_at: '',
    ...extra,
  }
}

describe('added by hand, and skipped', () => {
  test('added: its own line, with who added it and how much', () => {
    const l = buildShoppingList(input(STOCKED, { shopping: [row({ item_id: 'brinjal', quantity: 500 })] }))
    expect(l).toMatchObject([{ section: 'added', reasons: ['Added by Amma'], quantity: 500, wantId: 's-brinjal-want' }])
  })
  test('added and also needed: one line, ticked off together; bought ones are gone', () => {
    const i = input(STOCKED, { planned: [meal(D.curdRice)], shopping: [row({ item_id: 'curd', created_by: 'u1' })] })
    expect(buildShoppingList(i)).toMatchObject([{ section: 'planned', reasons: ["For Curd rice · today's lunch", 'Added by you'], wantId: 's-curd-want' }])
    expect(buildShoppingList({ ...i, shopping: [row({ item_id: 'brinjal', done_at: '2026-10-05T10:00:00Z' })] })[0].wantId).toBeNull()
  })
  test('skipped: hidden until the date passes, or a more urgent reason comes up', () => {
    const skip = row({ item_id: 'rice', kind: 'skip', skip_until: '2026-10-07', section: 'low' })
    expect(lines(input({ chicken: 1000 }, { shopping: [skip] }))).toEqual([])
    expect(lines(input({ chicken: 1000 }, { shopping: [{ ...skip, skip_until: '2026-10-04' }] }))).toHaveLength(1)
    const maybeSkip = row({ item_id: 'curd', kind: 'skip', skip_until: '2026-10-07', section: 'maybe' })
    expect(lines(input(STOCKED, { maybe: [meal(D.curdRice)], shopping: [maybeSkip] }))).toEqual([])
    expect(lines(input(STOCKED, { planned: [meal(D.curdRice)], shopping: [maybeSkip] }))).toHaveLength(1)
  })
})

describe('fish and meat for a non-veg day', () => {
  const rows = [stockRow(I.fish, [bought('fish', 500), bought('fish', 500)], NOW), stockRow(I.chicken, [bought('chicken', 1000)], NOW), stockRow(I.rice, [], NOW)]
  test('tomorrow is one, with nothing non-veg planned: offer what is bought most', () => {
    const nudges = nonVegNudges({ today: TODAY, targets: new Set(['2026-10-06']), plannedNonVegDates: new Set(), rows })
    expect(nudges).toEqual([{ date: '2026-10-06', day: 'Tomorrow', items: [I.fish, I.chicken] }])
  })
  test('none when it is planned, or not a non-veg day', () => {
    expect(nonVegNudges({ today: TODAY, targets: new Set(['2026-10-06']), plannedNonVegDates: new Set(['2026-10-06']), rows })).toEqual([])
    expect(nonVegNudges({ today: TODAY, targets: new Set(['2026-10-08']), plannedNonVegDates: new Set(), rows })).toEqual([])
  })
})

describe('the usual amount', () => {
  test('what was bought last time, else one step; enough to cover what is short', () => {
    expect(usualAmount(I.toor, [bought('toor', 1000, '2026-09-01T00:00:00Z'), bought('toor', 500, '2026-09-20T00:00:00Z')], null)).toBe(500)
    expect(usualAmount(I.toor, [], null)).toBe(500)
    expect(usualAmount(I.toor, [], 1200)).toBe(1500)
    expect(usualAmount(I.toor, [bought('toor', 2000)], 1200)).toBe(2000)
  })
})

describe('sharing', () => {
  test('plain text, both scripts, by section', () => {
    const l = buildShoppingList(input({ chicken: 1000 }, { planned: [meal(D.curdRice)] }))
    const nudge = { date: '2026-10-06', day: 'Tomorrow', items: [] }
    expect(shareText(l, [nudge], TODAY, 'ta_first')).toBe(
      ['Shopping · Mon 5 Oct', '', 'Tomorrow is a non-veg day: fish or meat', '', 'Running low', '• Rice-ta Rice', '', 'For planned meals', '• Curd-ta Curd · 750 g'].join('\n'),
    )
  })
})
