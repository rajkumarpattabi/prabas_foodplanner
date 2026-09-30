import { describe, expect, test } from 'vitest'
import { describeEvent, newestFirst } from './history.ts'
import { displayUnits, itemForm, itemPatch, parseAliases, reversePatch } from './itemEdit.ts'
import type { Item, StockEvent } from './types.ts'

const okra: Item = {
  id: 'okra',
  household_id: 'hh',
  name_ta: 'வெண்டைக்காய்',
  name_en: 'Ladies finger',
  aliases: ['okra', 'vendakkai'],
  category: 'vegetable',
  unit: 'g',
  display_unit: 'kg',
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
}

describe('editing an item', () => {
  test('the form shows amounts in the display unit, and an unchanged form changes nothing', () => {
    const form = itemForm(okra)
    expect(form).toMatchObject({ aliases: 'okra, vendakkai', step: '0.25', low_threshold: '', shelf_life_days: '5' })
    expect(itemPatch(okra, form)).toEqual({ patch: {} })
  })

  test('only what changed is saved, in stored units', () => {
    const form = { ...itemForm(okra), display_unit: 'g' as const, step: '500', low_threshold: '200', is_staple: true, aliases: 'okra, bhindi, Okra' }
    expect(itemPatch(okra, form)).toEqual({
      patch: { display_unit: 'g', step: 500, low_threshold: 200, is_staple: true, aliases: ['okra', 'bhindi'] },
    })
  })

  test('blank shelf life means it keeps', () => {
    expect(itemPatch(okra, { ...itemForm(okra), shelf_life_days: ' ' })).toEqual({ patch: { shelf_life_days: null } })
  })

  test.each([
    [{ name_en: ' ' }, 'Both names are needed.'],
    [{ shelf_life_days: '2.5' }, 'Shelf life is a number of days.'],
    [{ step: '0' }, 'The +/− step must be more than zero.'],
    [{ low_threshold: '-1' }, 'Running low is an amount, or blank for none.'],
  ])('%o is refused: %s', (change, error) => {
    expect(itemPatch(okra, { ...itemForm(okra), ...change })).toEqual({ error })
  })

  test('undo puts back the old values', () => {
    expect(reversePatch(okra, { name_en: 'Okra', step: 500 })).toEqual({ name_en: 'Ladies finger', step: 250 })
  })

  test('display units and aliases', () => {
    expect(displayUnits({ unit: 'ml' })).toEqual(['l', 'ml'])
    expect(displayUnits({ unit: 'bunch' })).toEqual(['bunch'])
    expect(parseAliases(' a, ,b,A ')).toEqual(['a', 'b'])
  })
})

describe('history lines', () => {
  const ev = (e: Partial<StockEvent>): StockEvent => ({
    id: 'e',
    household_id: 'hh',
    item_id: 'okra',
    kind: 'delta',
    quantity: 0,
    reason: null,
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: '2026-09-30T10:00:00.000Z',
    created_by: 'u1',
    created_at: '2026-09-30T10:00:00.000Z',
    ...e,
  })

  test.each([
    [{ quantity: 1500, reason: 'bought', expires_on: '2026-10-05' }, 'Bought 1.5 kg · use by 5 Oct'],
    [{ quantity: -250, reason: 'used' }, 'Used 250 g'],
    [{ quantity: -200, reason: 'spoiled' }, 'Spoiled 200 g'],
    [{ kind: 'set', quantity: 300, reason: 'correction' }, 'Corrected to 300 g'],
    [{ kind: 'set', quantity: 0, reason: 'used' }, 'Used up'],
    [{ kind: 'expiry', batch_id: 'b', expires_on: '2026-10-02' }, 'Use-by date changed to 2 Oct'],
    [{ quantity: 250, batch_id: 'b', reason: 'used', note: 'undo' }, 'Undo: put back 250 g'],
    [{ quantity: -250, batch_id: 'b', reason: 'correction', note: 'undo' }, 'Undo: took back 250 g'],
  ] as [Partial<StockEvent>, string][])('%o → %s', (e, line) => {
    expect(describeEvent(ev(e), okra)).toBe(line)
  })

  test('newest first', () => {
    const a = ev({ id: 'a', occurred_at: '2026-09-29T10:00:00.000Z' })
    const b = ev({ id: 'b' })
    expect(newestFirst([a, b]).map((e) => e.id)).toEqual(['b', 'a'])
  })
})
