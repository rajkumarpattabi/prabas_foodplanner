import { describe, expect, test } from 'vitest'
import type { Dish } from '../dishes/types.ts'
import type { Item } from '../stock/types.ts'
import { alternativeSides, comboFor, comboFromMeal, combosFor, isMainFor, swapSide, usableLeftovers } from './combos.ts'
import type { BatchState } from '../prepared/batchState.ts'
import type { ReadyPrepared } from '../prepared/ready.ts'
import { cookEvents, cookLines, dishNames, preparedEvents, preparedLines } from './cook.ts'
import { cookedNote, dishHistory } from './history.ts'
import { nextMeal } from './mealTime.ts'
import { scoreCombo, SCORING, suggest, WEIGHTS, type Factor, type PlanContext } from './score.ts'
import type { Leftover, MealRecord } from './types.ts'

// ---- Fixtures ---------------------------------------------------------------------------

const item = (id: string, name_en: string, category: Item['category'] = 'vegetable'): Item => ({
  id,
  household_id: 'hh',
  name_ta: name_en,
  name_en,
  aliases: [],
  category,
  unit: 'g',
  display_unit: 'g',
  shelf_life_days: 5,
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

const dish = (id: string, extra: Partial<Dish>): Dish => ({
  id,
  household_id: 'hh',
  catalog_key: id,
  name_ta: `${id}-ta`,
  name_en: id,
  aliases: [],
  type: 'tiffin',
  meals: ['breakfast'],
  is_veg: true,
  tags: [],
  ingredients: [],
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

const items = [item('rice', 'Rice', 'grain'), item('brinjal', 'Brinjal'), item('toor', 'Toor dal', 'dal'), item('curd', 'Curd', 'dairy'), item('cashew', 'Cashew', 'other')]
const itemsById = new Map(items.map((i) => [i.id, i]))

const D = {
  pongal: dish('pongal', {
    side_ids: ['brinjal_sambar', 'coconut_chutney', 'kara_chutney'],
    ingredients: [
      { item_id: 'rice', quantity: 400 },
      { item_id: 'cashew', quantity: 25, optional: true },
    ],
  }),
  idli: dish('idli', { meals: ['breakfast', 'dinner'], side_ids: ['tiffin_sambar', 'coconut_chutney'], ingredients: [{ item_id: 'rice', quantity: 500 }] }),
  upma: dish('upma', { dont_suggest: true }),
  ragi_koozh: dish('ragi_koozh', { type: 'drink' }),
  brinjal_sambar: dish('brinjal_sambar', {
    type: 'sambar',
    meals: ['breakfast', 'lunch'],
    ingredients: [
      { item_id: 'toor', quantity: 150 },
      { item_id: 'brinjal', quantity: 300 },
      { item_id: 'rice', quantity: 0 },
    ],
  }),
  tiffin_sambar: dish('tiffin_sambar', { type: 'sambar', ingredients: [{ item_id: 'toor', quantity: 150 }] }),
  coconut_chutney: dish('coconut_chutney', { type: 'chutney' }),
  kara_chutney: dish('kara_chutney', { type: 'chutney' }),
  beans_poriyal: dish('beans_poriyal', { type: 'poriyal', meals: ['lunch'] }),
  hidden_poriyal: dish('hidden_poriyal', { type: 'poriyal', meals: ['lunch'], dont_suggest: true }),
  vatha_kuzhambu: dish('vatha_kuzhambu', { type: 'kuzhambu', meals: ['lunch'], side_ids: ['beans_poriyal'] }),
  rasam: dish('rasam', { type: 'rasam', meals: ['lunch'] }),
  sadam: dish('sadam', {
    type: 'variety_rice',
    meals: ['lunch', 'dinner'],
    side_ids: ['brinjal_sambar', 'vatha_kuzhambu', 'rasam', 'hidden_poriyal', 'beans_poriyal'],
  }),
  curd_rice: dish('curd_rice', { type: 'variety_rice', meals: ['lunch'], ingredients: [{ item_id: 'curd', quantity: 750 }] }),
  chicken_kuzhambu: dish('chicken_kuzhambu', { type: 'nonveg_gravy', meals: ['lunch', 'dinner'], is_veg: false }),
}
const dishes = Object.values(D)
const dishesById = new Map(dishes.map((d) => [d.id, d]))

const TODAY = '2026-10-01'

function meal(date: string, dish_ids: string[], status: MealRecord['status'] = 'cooked'): MealRecord {
  return {
    id: `hh:${date}:lunch`,
    household_id: 'hh',
    date,
    meal: 'lunch',
    dish_ids,
    dish_names: [],
    status,
    cooked_by: 'u1',
    cooked_at: null,
    created_by: 'u1',
    created_at: '',
    updated_by: null,
    updated_at: '',
  }
}

function leftover(dish_id: string, extra: Partial<Leftover> = {}): Leftover {
  return {
    id: `lo-${dish_id}`,
    household_id: 'hh',
    dish_id,
    name_ta: dish_id,
    name_en: dish_id,
    meal_id: null,
    servings: 2,
    expires_on: TODAY,
    eaten_at: null,
    eaten_by: null,
    created_by: 'u1',
    created_at: '2026-09-30T20:00:00.000Z',
    updated_by: null,
    updated_at: '',
    ...extra,
  }
}

function ctx(extra: Partial<PlanContext> = {}): PlanContext {
  return {
    today: TODAY,
    itemsById,
    stockTotals: new Map([
      ['rice', 5000],
      ['toor', 500],
      ['brinjal', 500],
    ]),
    urgentItemIds: new Set(),
    trackedItemIds: new Set(),
    nonVegDay: false,
    history: new Map(),
    itemName: (i) => i.name_en,
    dishName: (d) => d.name_en,
    ...extra,
  }
}

// ---- Tests ------------------------------------------------------------------------------

describe('the next meal', () => {
  const at = (h: number, m = 0) => nextMeal(new Date(2026, 9, 1, h, m))
  test.each([
    [7, 0, '2026-10-01', 'breakfast'],
    [10, 29, '2026-10-01', 'breakfast'],
    [10, 30, '2026-10-01', 'lunch'],
    [14, 59, '2026-10-01', 'lunch'],
    [15, 0, '2026-10-01', 'dinner'],
    [20, 59, '2026-10-01', 'dinner'],
    [21, 0, '2026-10-02', 'breakfast'],
    [23, 30, '2026-10-02', 'breakfast'],
  ])('at %i:%i it is %s %s', (h, m, date, mealName) => {
    expect(at(h, m)).toEqual({ date, meal: mealName })
  })
})

describe('history', () => {
  test('counts cooked meals only, with the latest date', () => {
    const h = dishHistory([meal('2026-09-10', ['sadam', 'rasam']), meal('2026-09-20', ['sadam']), meal('2026-10-02', ['sadam'], 'planned')])
    expect(h.get('sadam')).toEqual({ lastCooked: '2026-09-20', timesCooked: 2 })
    expect(h.get('rasam')).toEqual({ lastCooked: '2026-09-10', timesCooked: 1 })
  })

  test.each([
    [null, 'Not cooked yet'],
    ['2026-10-01', 'Cooked today'],
    ['2026-09-30', 'Cooked yesterday'],
    ['2026-08-17', 'Cooked 45 days ago'],
  ])('%s → %s', (last, note) => {
    expect(cookedNote(last, TODAY)).toBe(note)
  })
})

describe('combos', () => {
  test('mains: dishes with sides, or tiffin, rice and drinks, for that meal, never hidden ones', () => {
    const mains = (m: Parameters<typeof isMainFor>[1]) => dishes.filter((d) => isMainFor(d, m)).map((d) => d.id)
    expect(mains('breakfast')).toEqual(['pongal', 'idli', 'ragi_koozh'])
    expect(mains('lunch')).toEqual(['vatha_kuzhambu', 'sadam', 'curd_rice'])
  })

  test('a gravy is a main only at lunch or dinner, and comes with plain rice', () => {
    const sambarWithSides = { ...D.brinjal_sambar, side_ids: ['beans_poriyal'] }
    expect(isMainFor(sambarWithSides, 'breakfast')).toBe(false)
    expect(isMainFor(sambarWithSides, 'lunch')).toBe(true)
    const rice = dish('rice_dish', { catalog_key: 'sadam', type: 'variety_rice', meals: ['lunch'], ingredients: [{ item_id: 'rice', quantity: 500 }] })
    const combo = combosFor('lunch', [...dishes.filter((d) => d.id !== 'brinjal_sambar' && d.id !== 'sadam'), sambarWithSides, rice]).find((c) => c.main.id === 'brinjal_sambar')!
    expect(combo.base?.id).toBe('rice_dish')
    expect(cookLines(combo).find((l) => l.item_id === 'rice')?.quantity).toBe(500)
    expect(dishNames(combo).map((n) => n.dish_id)).toEqual(['brinjal_sambar', 'rice_dish', 'beans_poriyal'])
    expect(comboFor(D.pongal, dishesById, [], rice).base).toBeNull()
  })

  test('sides: ranked, one of each kind, skipping hidden ones', () => {
    expect(comboFor(D.pongal, dishesById).sides.map((s) => s.id)).toEqual(['brinjal_sambar', 'coconut_chutney'])
    // Plain rice: a sambar and a poriyal, not a sambar and a kuzhambu (or the hidden poriyal).
    expect(comboFor(D.sadam, dishesById).sides.map((s) => s.id)).toEqual(['brinjal_sambar', 'beans_poriyal'])
  })

  test('a leftover gravy goes with tiffin first, in place of the sambar', () => {
    const lo = leftover('chicken_kuzhambu')
    const combo = comboFor(D.idli, dishesById, [lo])
    expect(combo.sides.map((s) => s.id)).toEqual(['chicken_kuzhambu', 'coconut_chutney'])
    expect(combo.leftover).toBe(lo)
  })

  test('a saved meal becomes its combo again; a deleted main gives none', () => {
    const rice = dish('rice_dish', { catalog_key: 'sadam', type: 'variety_rice' })
    const byId = new Map([...dishesById, ['rice_dish', rice]])
    const combo = comboFromMeal(['vatha_kuzhambu', 'rice_dish', 'beans_poriyal', 'gone'], byId)!
    expect(combo.main.id).toBe('vatha_kuzhambu')
    expect(combo.base?.id).toBe('rice_dish')
    expect(combo.sides.map((s) => s.id)).toEqual(['beans_poriyal'])
    expect(comboFromMeal(['gone', 'beans_poriyal'], byId)).toBeNull()
  })

  test('only leftovers still good today, and not eaten', () => {
    const fresh = leftover('a')
    expect(usableLeftovers([fresh, leftover('b', { expires_on: '2026-09-30' }), leftover('c', { eaten_at: 'x' })], TODAY)).toEqual([fresh])
  })

  test('alternatives: the main’s other ranked sides first, then dishes of the same type', () => {
    const combo = comboFor(D.pongal, dishesById)
    const alts = alternativeSides(combo, D.coconut_chutney, dishes).map((d) => d.id)
    expect(alts).toEqual(['kara_chutney'])
    const swapped = swapSide(combo, D.coconut_chutney, D.kara_chutney)
    expect(swapped.sides.map((s) => s.id)).toEqual(['brinjal_sambar', 'kara_chutney'])
    expect(alternativeSides(combo, D.brinjal_sambar, dishes).map((d) => d.id)).toEqual(['kara_chutney', 'tiffin_sambar'])
  })
})

describe('scoring', () => {
  test('weights are named', () => {
    expect(Object.keys(WEIGHTS)).toEqual([
      'nearExpiry',
      'inStock',
      'favourite',
      'kidsFavourite',
      'daysSinceCooked',
      'recentlyCooked',
      'leftover',
      'calendar',
      'prepared',
      'agedBatter',
      'nutrition',
    ])
    expect(WEIGHTS.nutrition).toBeGreaterThan(0)
  })

  test('the score is the sum of named, weighted factors', () => {
    const s = scoreCombo(comboFor(D.pongal, dishesById), ctx())
    expect(s.score).toBeCloseTo(Object.values(s.factors).reduce((a, b) => a + b, 0))
    expect(s.factors.inStock).toBe(WEIGHTS.inStock)
    expect(s.factors.daysSinceCooked).toBeCloseTo((SCORING.neverCookedDays / SCORING.fullAfterDays) * WEIGHTS.daysSinceCooked)
  })

  test('the why line comes from the two largest factors', () => {
    // Brinjal needs using, and there's no toor dal, so "everything in stock" isn't a reason.
    const stockTotals = new Map([
      ['rice', 5000],
      ['brinjal', 500],
    ])
    const s = scoreCombo(comboFor({ ...D.pongal, is_favourite: true }, dishesById), ctx({ stockTotals, urgentItemIds: new Set(['brinjal']) }))
    const top = (Object.keys(s.factors) as Factor[]).sort((a, b) => s.factors[b] - s.factors[a]).slice(0, 2)
    expect(top).toEqual(['nearExpiry', 'favourite'])
    expect(s.why).toBe('Uses Brinjal before it spoils · A favourite')
  })

  test('even one item about to spoil counts for more than everything being in stock', () => {
    const s = scoreCombo(comboFor(D.pongal, dishesById), ctx({ urgentItemIds: new Set(['brinjal']) }))
    expect(s.factors.nearExpiry).toBeGreaterThan(s.factors.inStock)
    expect(s.why.startsWith('Uses Brinjal before it spoils')).toBe(true)
  })

  test('a combo missing ingredients still scores, and says what it needs', () => {
    const s = scoreCombo(comboFor(D.curd_rice, dishesById), ctx())
    expect(s.needs).toEqual(['Curd'])
    expect(s.factors.inStock).toBe(0)
  })

  test('spices and oils only count as needed once they have been stocked here', () => {
    const pepper = item('pepper', 'Pepper', 'spice')
    const withPepper = { ...D.pongal, ingredients: [...D.pongal.ingredients, { item_id: 'pepper', quantity: 10 }] }
    const base = { itemsById: new Map([...itemsById, ['pepper', pepper]]) }
    expect(scoreCombo(comboFor(withPepper, dishesById), ctx(base)).needs).toEqual([])
    expect(scoreCombo(comboFor(withPepper, dishesById), ctx({ ...base, trackedItemIds: new Set(['pepper']) })).needs).toEqual(['Pepper'])
  })

  test('optional ingredients never count as needed', () => {
    expect(scoreCombo(comboFor(D.pongal, dishesById), ctx()).needs).toEqual([])
  })

  test('cooked in the last two days sinks a dish; not had for weeks lifts it', () => {
    const recent = scoreCombo(comboFor(D.sadam, dishesById), ctx({ history: new Map([['sadam', { lastCooked: '2026-09-30', timesCooked: 1 }]]) }))
    const fresh = scoreCombo(comboFor(D.sadam, dishesById), ctx())
    expect(recent.score).toBeLessThan(fresh.score - 5)
    const old = scoreCombo(comboFor(D.sadam, dishesById), ctx({ history: new Map([['sadam', { lastCooked: '2026-09-10', timesCooked: 3 }]]) }))
    expect(old.score).toBeGreaterThan(fresh.score)
    // The card's cooked note says how long; the why line doesn't repeat it.
    expect(old.cooked).toBe('Cooked 21 days ago')
    expect(old.why).not.toMatch(/week|different/)
  })

  test('a leftover lifts its combo, is named, and its dish needs no ingredients', () => {
    const combo = comboFor(D.idli, dishesById, [leftover('chicken_kuzhambu')])
    const s = scoreCombo(combo, ctx({ dishName: (d) => d.name_ta }))
    expect(s.factors.leftover).toBe(WEIGHTS.leftover)
    expect(s.why).toContain('Uses leftover chicken_kuzhambu-ta')
  })
})

describe('suggestions', () => {
  test('best first, never hidden dishes, stable for a seed', () => {
    const combos = combosFor('breakfast', dishes)
    const a = suggest(combos, ctx(), '2026-10-02:breakfast')
    const ids = [...a.picks, ...(a.rediscovery ? [a.rediscovery] : [])].map((s) => s.combo.main.id)
    expect(ids).not.toContain('upma')
    expect(suggest(combos, ctx(), '2026-10-02:breakfast').picks.map((s) => s.combo.main.id)).toEqual(a.picks.map((s) => s.combo.main.id))
    for (let i = 1; i < a.picks.length; i++) expect(a.picks[i - 1].score).toBeGreaterThanOrEqual(a.picks[i].score)
  })

  test('suggestions change as dishes get cooked', () => {
    const combos = combosFor('lunch', dishes)
    const before = suggest(combos, ctx(), 's').picks[0].combo.main.id
    const after = suggest(combos, ctx({ history: new Map([[before, { lastCooked: TODAY, timesCooked: 1 }]]) }), 's').picks[0].combo.main.id
    expect(after).not.toBe(before)
  })

  test('bring back: a liked dish not cooked for a month, from outside the top three', () => {
    const many = Array.from({ length: 5 }, (_, i) => dish(`t${i}`, { is_favourite: i < 3 }))
    const old = dish('adai', { is_kids_favourite: false })
    const history = new Map([
      ['adai', { lastCooked: '2026-08-01', timesCooked: 4 }],
      ...many.map((d) => [d.id, { lastCooked: '2026-09-26', timesCooked: 1 }] as const),
    ])
    const s = suggest(combosFor('breakfast', [...many, old]), ctx({ history }), 's')
    expect(s.rediscovery?.combo.main.id).toBe('adai')
    expect(s.picks.map((p) => p.combo.main.id)).not.toContain('adai')
  })

  test('with no history yet, bring back the best dish not cooked yet', () => {
    const s = suggest(combosFor('breakfast', Array.from({ length: 5 }, (_, i) => dish(`t${i}`, {}))), ctx(), 's')
    expect(s.rediscovery).not.toBeNull()
    expect(s.picks).toHaveLength(4)
  })
})

describe('veg-only days and non-veg days', () => {
  const eggRice = dish('egg_rice', { type: 'variety_rice', meals: ['lunch'], is_veg: false })
  const fishFry = dish('fish_fry', { type: 'nonveg_fry', meals: ['lunch'], is_veg: false })
  const sadamWithFish = { ...D.sadam, side_ids: ['fish_fry', 'brinjal_sambar', 'beans_poriyal'] }
  const all = [...dishes.filter((d) => d.id !== 'sadam'), eggRice, fishFry, sadamWithFish]
  const byId = new Map(all.map((d) => [d.id, d]))

  test('on a veg-only day: no non-veg mains, sides, or leftovers', () => {
    const veg = combosFor('lunch', all, [], { vegOnly: true })
    expect(veg.map((c) => c.main.id)).not.toContain('egg_rice')
    expect(veg.find((c) => c.main.id === 'sadam')!.sides.map((s) => s.id)).toEqual(['brinjal_sambar', 'beans_poriyal'])
    // Any other day, they're back.
    const any = combosFor('lunch', all)
    expect(any.map((c) => c.main.id)).toContain('egg_rice')
    expect(any.find((c) => c.main.id === 'sadam')!.sides.map((s) => s.id)).toEqual(['fish_fry', 'brinjal_sambar'])
    // A leftover chicken kuzhambu isn't offered with idli on a veg-only day.
    expect(comboFor(D.idli, dishesById, [leftover('chicken_kuzhambu')], null, true).leftover).toBeNull()
  })

  test('on a veg-only day, swap options are veg too', () => {
    const combo = comboFor(sadamWithFish, byId, [], null, true)
    const other = dish('egg_poriyal', { type: 'poriyal', is_veg: false })
    expect(alternativeSides(combo, D.beans_poriyal, [...all, other], 12, true).map((d) => d.id)).not.toContain('egg_poriyal')
    expect(alternativeSides(combo, D.beans_poriyal, [...all, other]).map((d) => d.id)).toContain('egg_poriyal')
  })

  test('on a non-veg day, non-veg combos get the calendar nudge and say so', () => {
    const fish = comboFor(sadamWithFish, byId)
    const plain = comboFor(D.curd_rice, byId)
    expect(scoreCombo(fish, ctx({ nonVegDay: true })).factors.calendar).toBe(WEIGHTS.calendar)
    expect(scoreCombo(fish, ctx({ nonVegDay: true })).why).toContain('Non-veg day')
    expect(scoreCombo(plain, ctx({ nonVegDay: true })).factors.calendar).toBe(0)
    expect(scoreCombo(fish, ctx({ nonVegDay: false })).factors.calendar).toBe(0)
  })
})

describe('cooking', () => {
  test('one line per item, amounts added up; optional ones start unticked', () => {
    const lines = cookLines(comboFor(D.pongal, dishesById))
    expect(lines).toEqual([
      { item_id: 'rice', quantity: 400, optional: false, include: true },
      { item_id: 'cashew', quantity: 25, optional: true, include: false },
      { item_id: 'toor', quantity: 150, optional: false, include: true },
      { item_id: 'brinjal', quantity: 300, optional: false, include: true },
    ])
  })

  test('a leftover side needs nothing', () => {
    const lines = cookLines(comboFor(D.idli, new Map([...dishesById, ['tiffin_sambar', D.tiffin_sambar]]), [leftover('tiffin_sambar')]))
    expect(lines.map((l) => l.item_id)).toEqual(['rice'])
  })

  test('stock taken: never more than there is, nothing when there is none, nothing unticked', () => {
    const events = cookEvents(
      [
        { item_id: 'rice', quantity: 400, optional: false, include: true },
        { item_id: 'toor', quantity: 900, optional: false, include: true },
        { item_id: 'curd', quantity: 750, optional: false, include: true },
        { item_id: 'brinjal', quantity: 300, optional: false, include: false },
      ],
      ctx().stockTotals,
    )
    expect(events).toEqual([
      { item_id: 'rice', kind: 'delta', quantity: -400, reason: 'cooked' },
      { item_id: 'toor', kind: 'delta', quantity: -500, reason: 'cooked' },
    ])
  })

  test('the meal keeps its dish names, main first', () => {
    expect(dishNames(comboFor(D.pongal, dishesById)).map((n) => n.dish_id)).toEqual(['pongal', 'brinjal_sambar', 'coconut_chutney'])
  })
})

describe('prepared items', () => {
  const batter = dish('batter', {
    type: 'prepared',
    name_en: 'Idli/dosa batter',
    meals: ['breakfast', 'dinner'],
    prep_plan: { stages: [], yield: 4, unit: 'meals', keeps_days: 3, ingredients: [{ item_id: 'rice', quantity: 2000 }], keep_going: true },
  })
  const dosa = dish('dosa', { uses_prepared: [{ dish_id: 'batter', quantity: 1 }] })
  const uthappam = dish('uthappam', { uses_prepared: [{ dish_id: 'batter', quantity: 1, prefers_aged: true }], ingredients: [{ item_id: 'brinjal', quantity: 150 }] })
  const byId = new Map([batter, dosa, uthappam].map((d) => [d.id, d]))
  const state = (id: string, remaining: number) => ({ batch: { id }, remaining }) as BatchState
  const ready = (ageDays = 0): Map<string, ReadyPrepared> =>
    new Map([['batter', { dish_id: 'batter', remaining: 3, unit: 'meals', ageDays, batches: [state('b1', 1), state('b2', 2)] }]])
  const score = (d: typeof dosa, prepared = ready()) => scoreCombo(comboFor(d, byId), ctx({ prepared, dishesById: byId }))

  test('batter is never a meal on its own', () => {
    expect(isMainFor(batter, 'breakfast')).toBe(false)
    expect(combosFor('breakfast', [batter, dosa]).map((c) => c.main.id)).toEqual(['dosa'])
  })

  test('batter ready: a lift, and the why line says so', () => {
    const s = score(dosa)
    expect(s.factors.prepared).toBe(WEIGHTS.prepared)
    expect(s.factors.agedBatter).toBe(0)
    expect(s.factors.inStock).toBe(WEIGHTS.inStock)
    expect(s.why).toBe("Everything's in stock · Idli/dosa batter is ready")
    expect(s.needs).toEqual([])
  })

  test('no batter ready: needs batter, and nothing counts as in stock', () => {
    const s = score(dosa, new Map())
    expect(s.factors.prepared).toBe(0)
    expect(s.factors.inStock).toBe(0)
    expect(s.needs).toEqual(['Idli/dosa batter'])
    // Not enough left counts as not ready.
    const two = scoreCombo({ main: dosa, base: null, sides: [uthappam], leftover: null }, ctx({ prepared: new Map([['batter', { ...ready().get('batter')!, remaining: 1 }]]), dishesById: byId }))
    expect(two.needs).toEqual(['Idli/dosa batter'])
  })

  test('older batter pushes uthappam, not dosa', () => {
    expect(score(uthappam, ready(2)).factors.agedBatter).toBe(WEIGHTS.agedBatter)
    expect(score(uthappam, ready(2)).why).toBe("Everything's in stock · Idli/dosa batter is 2 days old")
    expect(score(uthappam, ready(1)).factors.agedBatter).toBe(0)
    expect(score(dosa, ready(2)).factors.agedBatter).toBe(0)
    expect(score(uthappam, ready(2)).score).toBeGreaterThan(score(dosa, ready(2)).score)
  })

  test('cooking dosa takes a meal of batter, oldest batch first, and no rice or urad again', () => {
    const combo = comboFor(dosa, byId)
    expect(cookLines(combo)).toEqual([])
    const lines = preparedLines(combo, ready())
    expect(lines).toEqual([{ dish_id: 'batter', quantity: 1, available: 3, optional: false, include: true }])
    expect(preparedEvents(lines, ready())).toEqual([{ batch_id: 'b1', quantity: 1 }])
    expect(preparedEvents([{ ...lines[0], quantity: 2 }], ready())).toEqual([
      { batch_id: 'b1', quantity: 1 },
      { batch_id: 'b2', quantity: 1 },
    ])
    // None ready: the line shows, unticked.
    expect(preparedLines(combo, new Map())).toEqual([{ dish_id: 'batter', quantity: 1, available: 0, optional: false, include: false }])
  })
})
