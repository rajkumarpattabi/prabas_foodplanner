/// <reference types="node" />
// This test reads the catalogue files from disk, so it needs Node types.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseCatalog } from '../stock/catalog.ts'
import { searchItems } from '../stock/search.ts'
import { catalogDishIsVeg, checkDishCatalog, dishCatalogToMarkdown, dishCatalogToSql, parseDishCatalog, type CatalogDish } from './catalog.ts'
import { isSideType } from './rules.ts'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const items = parseCatalog(read('supabase/seed/item_catalog.psv'))
const itemsByKey = new Map(items.map((i) => [i.key, i]))
const dishes = parseDishCatalog(read('supabase/seed/dish_catalog.psv'))
const byKey = new Map(dishes.map((d) => [d.key, d]))
const veg = (key: string) => catalogDishIsVeg(byKey.get(key)!, itemsByKey)

describe('the starter dish catalogue', () => {
  test('has about 100 dishes, with nothing wrong in it', () => {
    expect(dishes.length).toBeGreaterThanOrEqual(90)
    expect(checkDishCatalog(dishes, items)).toEqual([])
  })

  test('migration 0007 and the review table are up to date (run `npm run catalog` after editing)', () => {
    expect(read('supabase/migrations/0007_dish_catalog.sql')).toBe(dishCatalogToSql(dishes))
    expect(read('docs/DISH_CATALOG.md')).toBe(dishCatalogToMarkdown(dishes, items))
  })

  test('includes the dishes that often fall out of rotation', () => {
    for (const key of ['poondu_kuzhambu', 'kollu_rasam', 'karamani_kuzhambu', 'ragi_koozh', 'adai', 'pesarattu']) {
      expect(byKey.has(key), key).toBe(true)
    }
  })

  test('the pairings from the requirements', () => {
    expect(byKey.get('ven_pongal')!.sides).toEqual(['kathirikkai_sambar', 'thengai_chutney'])
    expect(byKey.get('elumichai_sadam')!.sides[0]).toBe('urulai_roast')
  })

  test('every tiffin and rice main has a side to go with it (sweet pongal, pasta, noodles and sandwiches are eaten on their own)', () => {
    const alone = dishes.filter((d) => (d.type === 'tiffin' || d.type === 'variety_rice') && !d.sides.length).map((d) => d.key)
    expect(alone).toEqual(['sakkarai_pongal', 'pasta', 'veg_noodles', 'sandwich'])
  })

  test('egg, meat and fish dishes are non-veg; the rest are veg', () => {
    for (const key of ['muttai_kuzhambu', 'omelette', 'muttai_podimas', 'chicken_biryani', 'meen_kuzhambu', 'nandu_rasam', 'muttai_chutney', 'chicken_65']) {
      expect(veg(key), key).toBe(false)
    }
    for (const key of ['ven_pongal', 'thayir_sadam', 'paneer_butter_masala', 'appam', 'paneer_roll', 'thakkali_kurma']) expect(veg(key), key).toBe(true)
  })

  test('every meal has plenty of mains to choose from', () => {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      const mains = dishes.filter((d) => d.meals.includes(meal) && !isSideType(d.type))
      expect(mains.length, meal).toBeGreaterThanOrEqual(10)
    }
  })

  test.each([
    ['poondu kulambu', 'poondu_kuzhambu'],
    ['பூண்டு', 'poondu_kuzhambu'],
    ['pesaratu', 'pesarattu'],
    ['curd rice', 'thayir_sadam'],
  ])('"%s" finds %s first', (q, key) => {
    expect(searchItems(dishes.map((d) => ({ ...d, id: d.key })), q)[0]?.id).toBe(key)
  })
})

describe('checking a dish list', () => {
  const dish = (extra: Partial<CatalogDish>): CatalogDish => ({
    key: 'd',
    name_ta: 'தோசை',
    name_en: 'Dosa',
    type: 'tiffin',
    meals: ['breakfast'],
    tags: [],
    sides: [],
    ingredients: [{ item: 'idli_arisi', quantity: 500, optional: false }],
    aliases: [],
    ...extra,
  })

  test('catches unknown items and sides, self-pairing, and non-veg types with nothing non-veg', () => {
    expect(
      checkDishCatalog(
        [
          dish({ key: 'a', ingredients: [{ item: 'unicorn', quantity: 1, optional: false }] }),
          dish({ key: 'b', sides: ['b', 'nowhere'] }),
          dish({ key: 'c', type: 'nonveg_fry' }),
          dish({ key: 'e', tags: ['fish'] }),
        ],
        items,
      ),
    ).toEqual([
      'a: ingredient "unicorn" isn\'t in the item catalogue',
      "b: can't be its own side",
      'b: side "nowhere" isn\'t a dish in the catalogue',
      'c: a non-veg type with no meat, fish or egg',
      'e: tagged fish with no fish in it',
    ])
  })

  test('the parser reads optional ingredients and refuses bad lines', () => {
    const header = 'key|name_ta|name_en|type|meals|tags|sides|ingredients|aliases'
    const [d] = parseDishCatalog(`${header}\nx|தோசை|Dosa|tiffin|breakfast|||idli_arisi:500,karuveppilai:0.25?|dosa`)
    expect(d.ingredients).toEqual([
      { item: 'idli_arisi', quantity: 500, optional: false },
      { item: 'karuveppilai', quantity: 0.25, optional: true },
    ])
    expect(() => parseDishCatalog(`${header}\nx|தோசை|Dosa|tiffin|brunch|||idli_arisi:500|`)).toThrow('unknown meal "brunch"')
    expect(() => parseDishCatalog(`${header}\nx|Dosa|Dosa|tiffin|breakfast|||idli_arisi:500|`)).toThrow('has no Tamil script')
    expect(() => parseDishCatalog(`${header}\nx|தோசை|Dosa|tiffin|breakfast|||idli_arisi|`)).toThrow('should look like item_key:250')
  })
})
