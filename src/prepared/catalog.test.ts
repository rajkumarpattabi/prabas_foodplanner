/// <reference types="node" />
// This test reads the catalogue files from disk, so it needs Node types.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseDishCatalog } from '../dishes/catalog.ts'
import { parseCatalog } from '../stock/catalog.ts'
import { checkPreparedCatalog, parsePreparedCatalog, preparedCatalogToSql, stagesText } from './catalog.ts'
import { prepPlan } from './plan.ts'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const items = parseCatalog(read('supabase/seed/item_catalog.psv'))
const dishes = parseDishCatalog(read('supabase/seed/dish_catalog.psv'))
const cat = parsePreparedCatalog(read('supabase/seed/prepared.psv'))

const HEAD = 'key|name_ta|name_en|type|meals|tags|stages|yield|unit|keeps|keep_going|ingredients|aliases'
const USES = 'dish|uses|ingredients|add_sides'

describe('the prepared catalogue', () => {
  test('has no problems, and all ten items', () => {
    expect(checkPreparedCatalog(cat, dishes, items)).toEqual([])
    expect(cat.prepared.map((p) => p.key)).toEqual([
      'idli_dosa_batter',
      'paruppu_dosa_batter',
      'ragi_koozh',
      'kambu_koozh',
      'pazhaya_sadam',
      'soaked_chana',
      'chapathi_maavu',
      'puliyogare_paste',
      'idli_podi',
      'thakkali_thokku',
    ])
  })

  test('ragi koozh: soak overnight, cook, ferment a day; 10 glasses, 5 a meal', () => {
    const ragi = cat.prepared.find((p) => p.key === 'ragi_koozh')!
    expect(ragi.dish).toBeNull()
    expect(stagesText(ragi.stages)).toBe('Soak 9 h · cook 1 h · ferment 24 h (adjustable)')
    expect(ragi).toMatchObject({ yield: 10, unit: 'glasses', keeps_days: 3 })
    // As the app reads it, once the item keys are household ids.
    expect(prepPlan({ prep_plan: { ...ragi, ingredients: ragi.ingredients.map((i) => ({ item_id: i.item, quantity: i.quantity })) } })).not.toBeNull()
    expect(cat.changes.find((c) => c.dish === 'ragi_koozh')?.uses).toEqual([{ dish: 'ragi_koozh', quantity: 5, optional: false, prefers_aged: false }])
  })

  test('one batter for idli, dosa, uthappam and kuzhi paniyaram; another for adai', () => {
    const users = (key: string) => cat.changes.filter((c) => c.uses.some((u) => u.dish === key)).map((c) => c.dish)
    expect(users('idli_dosa_batter')).toEqual(['idli', 'dosai', 'uthappam', 'kuzhi_paniyaram'])
    expect(users('paruppu_dosa_batter')).toEqual(['adai'])
    expect(cat.changes.filter((c) => c.uses.some((u) => u.prefers_aged)).map((c) => c.dish)).toEqual(['uthappam', 'kuzhi_paniyaram'])
    // Dosa keeps only its oil: the rice and urad are in the batter.
    expect(cat.changes.find((c) => c.dish === 'dosai')?.ingredients).toEqual([{ item: 'kadalai_ennai', quantity: 100, optional: false }])
  })

  test('a starter dish changes only if nobody has edited it', () => {
    const sql = preparedCatalogToSql(cat, dishes)
    expect(sql).toContain(`where d.catalog_key = 'dosai'\n  and d.ingredients = private.catalog_ingredients(d.household_id, '[{"item":"idli_arisi","quantity":500}`)
  })
})

describe('mistakes it catches', () => {
  const check = (made: string, uses: string) => checkPreparedCatalog(parsePreparedCatalog(`${HEAD}\n${made}\n${USES}\n${uses}`), dishes, items)
  const batter = 'b|மாவு|Batter|prepared|||soak:5:takes,grind:0|4|meals|3|yes|idli_arisi:2000|'

  test('bad lines stop with where they are', () => {
    expect(() => parsePreparedCatalog(`${HEAD}\nb|மாவு|Batter|prepared|||boil:5|4|meals|3|yes|idli_arisi:1|`)).toThrow('prepared.psv line 2: stage "boil:5"')
    expect(() => parsePreparedCatalog(`${HEAD}\nb|மாவு|Batter|prepared|||soak:5:fast|4|meals|3|yes|idli_arisi:1|`)).toThrow('unknown flag "fast"')
    expect(() => parsePreparedCatalog(`${HEAD}\nb|மாவு|Batter|prepared|||soak:5|4|cups|3|yes|idli_arisi:1|`)).toThrow('unit should be meals or glasses')
    expect(() => parsePreparedCatalog(`${USES}\nidli|b:one||`)).toThrow('should look like idli_dosa_batter:1')
    expect(() => parsePreparedCatalog('idli|b:1||')).toThrow('expected a header line first')
  })

  test('plans that make no sense', () => {
    expect(check('b|மாவு|Batter|prepared|||soak:5,grind:0|4|meals|3|yes|idli_arisi:2000|', 'idli|b:1||')).toEqual(['b: exactly one stage takes the ingredients'])
    expect(check('b|மாவு|Batter|prepared|||ferment:5:wait:takes|4|meals|3|yes|idli_arisi:2000|', 'idli|b:1||')).toEqual(['b: the first stage has to be something to do'])
    expect(check('b|மாவு|Batter|prepared|||soak:5:takes|4|meals|3|yes|gold:1|', 'idli|b:1||')).toEqual(['b: ingredient "gold" isn\'t in the item catalogue'])
  })

  test('names, uses and sides that don’t exist', () => {
    expect(check(batter, 'idli|batter:1||')).toEqual(['idli: uses "batter", which isn\'t made ahead'])
    expect(check(batter, 'nope|b:1||idli')).toEqual(["nope: isn't a dish"])
    expect(check(batter, 'idli|b:1||nope')).toEqual(['idli: side "nope" isn\'t a dish'])
    expect(check('idli|இட்லி|Idli|prepared|||soak:5:takes|4|meals|3|yes|idli_arisi:1|', 'dosai|idli:1||')).toEqual(['idli: already a catalogue dish; leave its name and type empty'])
    expect(check('ghost||||||soak:5:takes|4|meals|3|yes|idli_arisi:1|', 'idli|ghost:1||')).toEqual(['ghost: not a catalogue dish, so it needs a name and type', 'ghost: is eaten as it is, so it needs a line below using itself'])
  })

  test('something eaten as it is has to use itself', () => {
    expect(check('p|பொடி|Podi|chutney|breakfast||roast:1:takes|10|meals|60|no|ulutham_paruppu:100|', 'idli|p:1:optional||')).toEqual(['p: is eaten as it is, so it needs a line below using itself'])
  })
})
