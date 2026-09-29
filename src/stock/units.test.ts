import { describe, expect, test } from 'vitest'
import { defaultStep, entryUnits, formatQuantity, fromBase, toBase } from './units.ts'

const rice = { unit: 'g', piece_weight_g: null } as const
const tomato = { unit: 'g', piece_weight_g: 100 } as const
const milk = { unit: 'ml', piece_weight_g: null } as const
const coconut = { unit: 'piece', piece_weight_g: 400 } as const
const lemon = { unit: 'piece', piece_weight_g: null } as const
const coriander = { unit: 'bunch', piece_weight_g: null } as const

describe('toBase', () => {
  test('weights and volumes', () => {
    expect(toBase(1.5, 'kg', rice)).toBe(1500)
    expect(toBase(250, 'g', rice)).toBe(250)
    expect(toBase(0.5, 'l', milk)).toBe(500)
    expect(toBase(200, 'ml', milk)).toBe(200)
  })

  test('pieces and grams, when the item has a piece weight', () => {
    expect(toBase(3, 'piece', tomato)).toBe(300)
    expect(toBase(1, 'kg', coconut)).toBe(2.5)
    expect(toBase(2, 'piece', coconut)).toBe(2)
  })

  test("can't convert without a piece weight, or across kinds", () => {
    expect(toBase(1, 'piece', rice)).toBeNull()
    expect(toBase(1, 'kg', lemon)).toBeNull()
    expect(toBase(1, 'ml', rice)).toBeNull()
    expect(toBase(1, 'kg', milk)).toBeNull()
    expect(toBase(Number.NaN, 'kg', rice)).toBeNull()
  })

  test('fromBase is the reverse', () => {
    expect(fromBase(1500, 'kg', rice)).toBe(1.5)
    expect(fromBase(300, 'piece', tomato)).toBe(3)
    expect(fromBase(1, 'kg', lemon)).toBeNull()
  })
})

describe('entryUnits', () => {
  test('offers the units that make sense for each item', () => {
    expect(entryUnits(rice)).toEqual(['kg', 'g'])
    expect(entryUnits(tomato)).toEqual(['kg', 'g', 'piece'])
    expect(entryUnits(milk)).toEqual(['l', 'ml'])
    expect(entryUnits(coconut)).toEqual(['piece', 'kg', 'g'])
    expect(entryUnits(coriander)).toEqual(['bunch'])
  })
})

describe('formatQuantity', () => {
  test.each([
    [750, rice, '750 g'],
    [1500, rice, '1.5 kg'],
    [10250, rice, '10.3 kg'],
    [1000, milk, '1 l'],
    [1, lemon, '1 piece'],
    [6, lemon, '6 pieces'],
    [0.5, coconut, '0.5 pieces'],
    [2, coriander, '2 bunches'],
    [-3, rice, '0 g'],
  ] as const)('%d → %s', (amount, item, text) => {
    expect(formatQuantity(amount, item)).toBe(text)
  })

  test('default steps', () => {
    expect(defaultStep('g')).toBe(250)
    expect(defaultStep('ml')).toBe(250)
    expect(defaultStep('bunch')).toBe(1)
  })
})
