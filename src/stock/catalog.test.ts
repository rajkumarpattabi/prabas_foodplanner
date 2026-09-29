/// <reference types="node" />
// This test reads the catalogue files from disk, so it needs Node types.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { catalogToSql, parseCatalog, type CatalogItem } from './catalog.ts'
import { searchItems } from './search.ts'

// Tests run from the project root. (jsdom's URL isn't one node:fs accepts.)
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const items = parseCatalog(read('supabase/seed/item_catalog.psv'))
const byKey = new Map(items.map((i) => [i.key, i]))
const find = (q: string) => searchItems(items.map((i) => ({ ...i, id: i.key })), q).map((i) => i.id)

describe('the starter catalogue', () => {
  test('has about 200 items', () => {
    expect(items.length).toBeGreaterThanOrEqual(190)
  })

  test('migration 0005 is up to date with the list (run `npm run catalog` after editing it)', () => {
    expect(read('supabase/migrations/0005_item_catalog.sql').replace(/\r\n/g, '\n')).toBe(catalogToSql(items))
  })

  test('every staple from the requirements is there and marked as a staple', () => {
    const staples = [
      'periya_vengayam',
      'chinna_vengayam',
      'thakkali',
      'thengai',
      'karuveppilai',
      'kothamalli',
      'pachai_milagai',
      'inji',
      'thayir',
      'paal',
      'kadalai_ennai',
      'pacharisi',
      'thuvaram_paruppu',
      'ulutham_paruppu',
    ]
    for (const key of staples) expect(byKey.get(key)?.is_staple, key).toBe(true)
  })

  test('the requirements example: ladies finger with its aliases', () => {
    const okra = byKey.get('vendakkai')!
    expect(okra.name_ta).toBe('வெண்டைக்காய்')
    expect(okra.aliases).toEqual(expect.arrayContaining(['vendakkai', 'ladies finger', 'lady finger', 'okra', 'bhindi', 'L.Finger']))
  })

  test.each(['வெண்டை', 'vendakkai', 'vendakai', 'okra'])('"%s" finds ladies finger first', (q) => {
    expect(find(q)[0]).toBe('vendakkai')
  })

  test('big onion and small onion are separate items', () => {
    expect(find('chinna vengayam')[0]).toBe('chinna_vengayam')
    expect(find('periya vengayam')[0]).toBe('periya_vengayam')
    expect(find('shallots')[0]).toBe('chinna_vengayam')
  })

  test('coconut is tracked whole and opened; opened keeps 3 days', () => {
    expect(byKey.get('thengai')).toMatchObject({ unit: 'piece', has_opened_form: true, opened_shelf_life_days: 3 })
  })

  test('greens come in bunches and spoil fast; things that keep have no shelf life', () => {
    const greens = items.filter((i) => i.category === 'greens')
    expect(greens.every((g) => g.unit === 'bunch' && (g.shelf_life_days ?? 99) <= 7)).toBe(true)
    expect(byKey.get('pacharisi')?.shelf_life_days).toBeNull()
  })

  test('no alias is shared by two items (it would make bill matching ambiguous)', () => {
    const owner = new Map<string, CatalogItem>()
    const clashes: string[] = []
    for (const item of items) {
      for (const a of item.aliases.map((x) => x.toLowerCase())) {
        const other = owner.get(a)
        if (other && other.key !== item.key) clashes.push(`"${a}": ${other.key} and ${item.key}`)
        owner.set(a, item)
      }
    }
    expect(clashes).toEqual([])
  })
})

describe('parseCatalog', () => {
  const header = 'key|name_ta|name_en|category|unit|display_unit|shelf_life_days|is_staple|low_threshold|piece_weight_g|opened_shelf_life_days|step|aliases'
  test('reports the line for a bad row', () => {
    expect(() => parseCatalog(`${header}\nx|x|X|vegetable|g|kg|4|||||250|a`)).toThrow('line 2: name_ta "x" has no Tamil script')
    expect(() => parseCatalog(`${header}\nx|க|X|veg|g|kg|4|||||250|a`)).toThrow('unknown category "veg"')
    expect(() => parseCatalog(`${header}\nx|க|X|vegetable|g|l|4|||||250|a`)).toThrow('display_unit "l" doesn\'t fit unit "g"')
    expect(() => parseCatalog(`${header}\nx|க|X|vegetable|g|kg|4||||250|a`)).toThrow('expected 13 columns, got 12')
  })
})
