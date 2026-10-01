import { describe, expect, test } from 'vitest'
import type { Category } from '../stock/types.ts'
import { filterDishes, NO_FILTER } from './filter.ts'
import { addSide, ICON_GROUP, isSideType, isVeg, moveSide, removeIngredient, removeSide, setIngredient } from './rules.ts'
import { DISH_TYPES, type Dish } from './types.ts'

const items = new Map<string, { category: Category }>([
  ['rice', { category: 'grain' }],
  ['egg', { category: 'egg' }],
  ['chicken', { category: 'meat' }],
  ['prawn', { category: 'fish' }],
  ['curd', { category: 'dairy' }],
])

describe('veg or non-veg', () => {
  test('meat, fish, and egg make a dish non-veg; dairy does not', () => {
    expect(isVeg([{ item_id: 'rice', quantity: 500 }, { item_id: 'curd', quantity: 500 }], items)).toBe(true)
    expect(isVeg([{ item_id: 'chicken', quantity: 1000 }], items)).toBe(false)
    expect(isVeg([{ item_id: 'prawn', quantity: 500 }], items)).toBe(false)
  })

  test('egg counts as non-veg, even as an optional topping', () => {
    expect(isVeg([{ item_id: 'rice', quantity: 500 }, { item_id: 'egg', quantity: 2, optional: true }], items)).toBe(false)
  })

  test('an ingredient that cannot be found does not decide it', () => {
    expect(isVeg([{ item_id: 'gone', quantity: 1 }], items)).toBe(true)
  })
})

describe('icons and sides', () => {
  test('every dish type has one of the six icons', () => {
    expect(new Set(DISH_TYPES.map((t) => ICON_GROUP[t]))).toEqual(new Set(['tiffin', 'rice', 'kuzhambu', 'poriyal', 'nonveg', 'drink']))
  })

  test('sambar and chutney are sides; tiffin and rice are mains', () => {
    expect(isSideType('sambar')).toBe(true)
    expect(isSideType('chutney')).toBe(true)
    expect(isSideType('tiffin')).toBe(false)
    expect(isSideType('variety_rice')).toBe(false)
  })
})

describe('editing lists', () => {
  test('ingredients: add, change, remove', () => {
    let list = setIngredient([], { item_id: 'rice', quantity: 500 })
    list = setIngredient(list, { item_id: 'curd', quantity: 250 })
    list = setIngredient(list, { item_id: 'rice', quantity: 750 })
    expect(list).toEqual([
      { item_id: 'rice', quantity: 750 },
      { item_id: 'curd', quantity: 250 },
    ])
    expect(removeIngredient(list, 'rice')).toEqual([{ item_id: 'curd', quantity: 250 }])
  })

  test('sides: ranked, no duplicates, never the dish itself', () => {
    let sides = addSide([], 'pongal', 'sambar')
    sides = addSide(sides, 'pongal', 'chutney')
    sides = addSide(sides, 'pongal', 'sambar')
    sides = addSide(sides, 'pongal', 'pongal')
    expect(sides).toEqual(['sambar', 'chutney'])
    expect(moveSide(sides, 'chutney', -1)).toEqual(['chutney', 'sambar'])
    expect(moveSide(sides, 'sambar', -1)).toEqual(['sambar', 'chutney'])
    expect(removeSide(sides, 'sambar')).toEqual(['chutney'])
  })
})

describe('the Dishes list', () => {
  const dish = (id: string, extra: Partial<Dish>): Dish => ({
    id,
    household_id: 'hh',
    catalog_key: null,
    name_ta: id,
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
  const dishes = [
    dish('Poondu kuzhambu', { name_ta: 'பூண்டு குழம்பு', type: 'kuzhambu', meals: ['lunch'], aliases: ['poondu kuzhambu', 'garlic kuzhambu'] }),
    dish('Pongal', { is_favourite: true }),
    dish('Adai', { is_kids_favourite: true, meals: ['breakfast', 'dinner'] }),
    dish('Upma', { dont_suggest: true }),
  ]
  const names = (list: Dish[]) => list.map((d) => d.name_en)

  test('grouped by type, then by name', () => {
    expect(names(filterDishes(dishes, NO_FILTER))).toEqual(['Adai', 'Pongal', 'Upma', 'Poondu kuzhambu'])
  })

  test('search finds either script and Tanglish spellings', () => {
    expect(names(filterDishes(dishes, { ...NO_FILTER, query: 'poondu kulambu' }))).toEqual(['Poondu kuzhambu'])
    expect(names(filterDishes(dishes, { ...NO_FILTER, query: 'பூண்டு' }))).toEqual(['Poondu kuzhambu'])
  })

  test('filters: type, meal, favourites (either kind), hidden only', () => {
    expect(names(filterDishes(dishes, { ...NO_FILTER, type: 'kuzhambu' }))).toEqual(['Poondu kuzhambu'])
    expect(names(filterDishes(dishes, { ...NO_FILTER, meal: 'dinner' }))).toEqual(['Adai'])
    expect(names(filterDishes(dishes, { ...NO_FILTER, favourites: true }))).toEqual(['Adai', 'Pongal'])
    expect(names(filterDishes(dishes, { ...NO_FILTER, hidden: true }))).toEqual(['Upma'])
  })
})
