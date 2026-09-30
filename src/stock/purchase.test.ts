import { describe, expect, test } from 'vitest'
import { amountToBase, namesFromQuery, newItem, parseAmount, purchaseDefaults, purchaseEvent } from './purchase.ts'

const okra = { id: 'okra', unit: 'g', display_unit: 'kg', piece_weight_g: null, step: 250, shelf_life_days: 5 } as const
const rice = { id: 'rice', unit: 'g', display_unit: 'kg', piece_weight_g: null, step: 1000, shelf_life_days: null } as const
const lemon = { id: 'lemon', unit: 'piece', display_unit: 'piece', piece_weight_g: 50, step: 1, shelf_life_days: 10 } as const

describe('purchase defaults', () => {
  test('one usual step in the usual unit, with the usual expiry', () => {
    expect(purchaseDefaults(okra, '2026-09-30')).toEqual({ amount: '250', unit: 'g', expiresOn: '2026-10-05' })
    expect(purchaseDefaults({ ...okra, step: 1500 }, '2026-09-30')).toMatchObject({ amount: '1.5', unit: 'kg' })
    expect(purchaseDefaults(lemon, '2026-09-30')).toEqual({ amount: '1', unit: 'piece', expiresOn: '2026-10-10' })
  })

  test('things that keep have no date', () => {
    expect(purchaseDefaults(rice, '2026-09-30')).toEqual({ amount: '1', unit: 'kg', expiresOn: '' })
  })
})

describe('the purchase saved', () => {
  test('in the stored unit, with the expiry date always kept on it', () => {
    expect(purchaseEvent(okra, { amount: '1.5', unit: 'kg', expiresOn: '2026-10-03' })).toEqual({
      item_id: 'okra',
      kind: 'delta',
      quantity: 1500,
      reason: 'bought',
      expires_on: '2026-10-03',
    })
    expect(purchaseEvent(rice, { amount: '5', unit: 'kg', expiresOn: '' })).toMatchObject({ quantity: 5000, expires_on: null })
    expect(purchaseEvent(lemon, { amount: '200', unit: 'g', expiresOn: '' })).toMatchObject({ quantity: 4 })
  })

  test('nothing to save without a usable amount', () => {
    for (const amount of ['', '0', '-1', 'abc']) {
      expect(purchaseEvent(okra, { amount, unit: 'kg', expiresOn: '' })).toBeNull()
    }
    expect(parseAmount('1,5')).toBe(1.5)
  })

  test('amounts for corrections may be zero', () => {
    expect(amountToBase('0', 'kg', okra)).toBeNull()
    expect(amountToBase('0', 'kg', okra, { allowZero: true })).toBe(0)
    expect(amountToBase('0,3', 'kg', okra)).toBe(300)
    expect(amountToBase('', 'kg', okra, { allowZero: true })).toBeNull()
  })
})

describe('a new item', () => {
  test('gets its category’s usual units and shelf life', () => {
    expect(newItem({ name_ta: ' கத்தரிக்காய் ', name_en: 'Brinjal', category: 'vegetable', unit: 'g' })).toMatchObject({
      name_ta: 'கத்தரிக்காய்',
      display_unit: 'kg',
      shelf_life_days: 5,
      aliases: [],
    })
    expect(newItem({ name_ta: 'கடலை எண்ணெய்', name_en: 'Groundnut oil', category: 'oil', unit: 'ml' })).toMatchObject({
      display_unit: 'l',
      shelf_life_days: null,
    })
    expect(newItem({ name_ta: 'சோம்பு', name_en: 'Fennel', category: 'spice', unit: 'g' })).toMatchObject({ display_unit: 'g' })
  })

  test('another spelling searched for is kept as an alias, so the same search finds it', () => {
    const base = { name_ta: 'கத்தரிக்காய்', name_en: 'Brinjal', category: 'vegetable', unit: 'g' } as const
    expect(newItem({ ...base, query: 'kathirikai' }).aliases).toEqual(['kathirikai'])
    expect(newItem({ ...base, query: 'brinjal ' }).aliases).toEqual([])
    expect(newItem({ ...base, query: 'கத்தரிக்காய்' }).aliases).toEqual([])
  })

  test('the search pre-fills the name in its own script', () => {
    expect(namesFromQuery('கத்தரி')).toEqual({ name_ta: 'கத்தரி', name_en: '' })
    expect(namesFromQuery(' Brinjal ')).toEqual({ name_ta: '', name_en: 'Brinjal' })
  })
})
