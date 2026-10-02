import { describe, expect, test } from 'vitest'
import type { Item } from '../stock/types.ts'
import { perUnitText, pricePerUnit, quantityFromPrice } from './estimate.ts'
import { matchLine, normaliseName, normaliseVendor, type BillAlias } from './match.ts'
import { parseBill, parseLine } from './parse.ts'
import { aliasesToSave, reviewLine, reviewLines, type ReviewContext } from './review.ts'

const item = (id: string, name_en: string, name_ta: string, extra: Partial<Item> = {}): Item => ({
  id,
  household_id: 'hh',
  name_ta,
  name_en,
  aliases: [],
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
  ...extra,
})
const I = {
  tomato: item('tomato', 'Tomato', 'தக்காளி', { aliases: ['thakkali'] }),
  brinjal: item('brinjal', 'Brinjal', 'கத்தரிக்காய்', { aliases: ['kathirikkai'] }),
  beans: item('beans', 'Beans', 'பீன்ஸ்', { aliases: ['french beans'] }),
  broad: item('broad', 'Broad beans', 'அவரைக்காய்', { aliases: ['avarakkai'] }),
  coriander: item('coriander', 'Coriander', 'கொத்தமல்லி', { category: 'greens', unit: 'bunch', display_unit: 'bunch', step: 1 }),
  coconut: item('coconut', 'Coconut', 'தேங்காய்', { category: 'other', unit: 'piece', display_unit: 'piece', step: 1 }),
  onion: item('onion', 'Onion', 'வெங்காயம்', { aliases: ['vengayam'] }),
}
const items = Object.values(I)

const BILL = ['Murugan Vegetables', 'Tomato 1kg 40', 'Brinjal 40', '500g beans 30', 'தக்காளி 1 கி 40', 'கொத்தமல்லி 2 கட்டு 20', 'Coconut 2 pcs 60', 'Carry bag 5', 'Total 235', '12/10/2026', 'Thank you'].join('\n')

describe('reading a bill', () => {
  test('the shop, then each line: name, quantity and unit, price; not-groceries set aside', () => {
    const bill = parseBill(BILL)
    expect(bill.vendor).toBe('Murugan Vegetables')
    expect(bill.lines.map((l) => [l.other ? l.raw : l.name, l.quantity, l.unit, l.price, l.other])).toEqual([
      ['Tomato', 1, 'kg', 40, false],
      ['Brinjal', null, null, 40, false],
      ['beans', 500, 'g', 30, false],
      ['தக்காளி', 1, 'kg', 40, false],
      ['கொத்தமல்லி', 2, 'bunch', 20, false],
      ['Coconut', 2, 'piece', 60, false],
      ['Carry bag 5', null, null, null, true],
      ['Total 235', null, null, null, true],
      ['12/10/2026', null, null, null, true],
      ['Thank you', null, null, null, true],
    ])
  })

  test('serial numbers, rupee signs, halves, counts, thousands', () => {
    expect(parseLine('1. Onion 2 60')).toMatchObject({ name: 'Onion', quantity: 2, unit: null, price: 60 })
    expect(parseLine('Tomato 1/2 kg ₹20')).toMatchObject({ name: 'Tomato', quantity: 0.5, unit: 'kg', price: 20 })
    expect(parseLine('Rice 25kg Rs. 1,250')).toMatchObject({ name: 'Rice', quantity: 25, unit: 'kg', price: 1250 })
    expect(parseLine('Coconut x3 75/-')).toMatchObject({ name: 'Coconut', quantity: 3, price: 75 })
    expect(parseLine('வெங்காயம் 2 கிலோ 80')).toMatchObject({ name: 'வெங்காயம்', quantity: 2, unit: 'kg', price: 80 })
    expect(parseLine('   ')).toBeNull()
  })

  test('no shop name when the first line is an item; Tamil totals set aside', () => {
    const bill = parseBill('Tomato 40\nமொத்தம் 70\nOnion 30')
    expect(bill.vendor).toBe('')
    expect(bill.lines.map((l) => [l.raw, l.other])).toEqual([
      ['Tomato 40', false],
      ['மொத்தம் 70', true],
      ['Onion 30', false],
    ])
  })
})

describe('matching a name', () => {
  const ctx = (aliases: BillAlias[] = [], vendor = '') => ({ items, aliases, vendor })
  const m = (name: string, aliases: BillAlias[] = [], vendor = '') => {
    const r = matchLine(name, ctx(aliases, vendor))
    return [r.item?.id ?? null, r.kind, r.confidence]
  }

  test('exact: English, Tamil script, or an alias in Tanglish', () => {
    expect(m('Tomato')).toEqual(['tomato', 'exact', 'sure'])
    expect(m('தக்காளி')).toEqual(['tomato', 'exact', 'sure'])
    expect(m('Thakali')).toEqual(['tomato', 'exact', 'sure'])
    expect(m('Nattu thakkali')).toEqual(['tomato', 'exact', 'sure'])
  })

  test('misreads: one edit is sure, two (or a tie) is worth a look', () => {
    expect(m('Tomatto')).toEqual(['tomato', 'exact', 'sure']) // folding takes the double t
    expect(m('Brinjai')).toEqual(['brinjal', 'fuzzy', 'sure'])
    expect(m('Kathirikay')).toEqual(['brinjal', 'exact', 'sure'])
    expect(m('Brinjaul')).toEqual(['brinjal', 'fuzzy', 'sure'])
    expect(m('Brinjaulx')).toEqual(['brinjal', 'fuzzy', 'check'])
  })

  test('ambiguous words always ask, unless this shop’s meaning is known', () => {
    const asked = matchLine('Beans', ctx())
    expect(asked).toMatchObject({ item: null, confidence: 'none', ambiguous: true })
    expect(asked.guesses.map((i) => i.id)).toEqual(['beans', 'broad'])
    // A household-wide mapping doesn't settle it; this shop's does.
    expect(m('Beans', [{ vendor: '', raw: normaliseName('Beans'), item_id: 'beans' }])).toEqual([null, 'unknown', 'none'])
    expect(m('Beans', [{ vendor: normaliseVendor('Murugan Vegetables'), raw: normaliseName('Beans'), item_id: 'broad' }], 'Murugan Vegetables')).toEqual(['broad', 'vendor', 'sure'])
  })

  test('mapped once: the household’s own name matches next time, this shop’s first', () => {
    const aliases: BillAlias[] = [
      { vendor: '', raw: normaliseName('Thengai big'), item_id: 'coconut' },
      { vendor: normaliseVendor('Anbu Stores'), raw: normaliseName('Tomato'), item_id: 'onion' },
    ]
    expect(m('Thengai big', aliases)).toEqual(['coconut', 'household', 'sure'])
    expect(m('Tomato', aliases, 'Anbu Stores')).toEqual(['onion', 'vendor', 'sure'])
  })

  test('a partial name: the closest guesses; nothing like it: unknown', () => {
    const r = matchLine('Corian', ctx())
    expect(r).toMatchObject({ kind: 'guess', confidence: 'check', item: { id: 'coriander' } })
    expect(m('Zqxv')).toEqual([null, 'unknown', 'none'])
  })
})

describe('quantity from price', () => {
  const p = (quantity: number, price: number | null, day: number) => ({ quantity, price, occurred_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z` })
  test('the middle of the last five priced purchases, in steps of the usual amount', () => {
    const per = pricePerUnit([p(1000, 50, 1), p(1000, 60, 2), p(1000, 40, 3), p(500, null, 4)])
    expect(per).toBeCloseTo(0.05)
    expect(quantityFromPrice(40, per!, I.brinjal)).toBe(750)
    expect(quantityFromPrice(5, per!, I.brinjal)).toBe(250) // at least one step
    expect(perUnitText(per!, I.brinjal)).toBe('₹50/kg')
    expect(pricePerUnit([])).toBeNull()
    // Only the newest five count.
    expect(pricePerUnit([p(1000, 1000, 1), ...[2, 3, 4, 5, 6].map((d) => p(1000, 30, d))])).toBeCloseTo(0.03)
  })
})

describe('the review', () => {
  const ctx = (extra: Partial<ReviewContext> = {}): ReviewContext => ({
    items,
    aliases: [],
    vendor: 'Murugan Vegetables',
    purchases: new Map([['brinjal', [{ quantity: 1000, price: 50, occurred_at: '2026-09-20T10:00:00Z' }]]]),
    boughtToday: new Set(),
    ...extra,
  })
  const summary = (c = ctx()) => reviewLines(parseBill(BILL), c).map((l) => [l.line.other ? l.line.raw : l.line.name, l.section, l.item?.id ?? null, l.quantity, l.include, l.reasons])

  test('sorted by attention: needs mapping, check these, matched, not groceries', () => {
    expect(summary()).toEqual([
      ['beans', 'map', null, null, false, ['“beans” can mean more than one thing. Which one?']],
      ['Brinjal', 'check', 'brinjal', 750, false, ['Estimated from ₹50/kg']],
      ['Tomato', 'matched', 'tomato', 1000, true, []],
      ['தக்காளி', 'matched', 'tomato', 1000, true, []],
      ['கொத்தமல்லி', 'matched', 'coriander', 2, true, []],
      ['Coconut', 'matched', 'coconut', 2, true, []],
      ['Carry bag 5', 'other', null, null, false, []],
      ['Total 235', 'other', null, null, false, []],
      ['12/10/2026', 'other', null, null, false, []],
      ['Thank you', 'other', null, null, false, []],
    ])
  })

  test('something bought today already waits for a look, unticked', () => {
    const coconut = summary(ctx({ boughtToday: new Set(['coconut']) })).find((l) => l[0] === 'Coconut')
    expect(coconut).toEqual(['Coconut', 'check', 'coconut', 2, false, ['Bought today already?']])
  })

  test('mapped by hand: remembered for this shop, and (unless ambiguous) for the household', () => {
    const bill = parseBill('Murugan Vegetables\nBeans 30\nThengai 2 60')
    const [beans, thengai] = bill.lines
    const c = ctx()
    const mapped = [
      reviewLine('l0', beans, matchLine(beans.name, c), c, I.broad),
      reviewLine('l1', thengai, matchLine(thengai.name, c), c, I.coconut),
    ]
    expect(mapped.map((l) => [l.section, l.confirmed, l.include])).toEqual([
      ['check', true, false], // Broad beans has no price history: how much?
      ['matched', true, true],
    ])
    const saved = aliasesToSave([{ ...mapped[0], include: true }, mapped[1]], 'Murugan Vegetables')
    const shop = normaliseVendor('Murugan Vegetables')
    expect(saved).toEqual([
      { vendor: shop, raw: 'peans', item_id: 'broad' },
      { vendor: shop, raw: 'tenkai', item_id: 'coconut' },
      { vendor: '', raw: 'tenkai', item_id: 'coconut' },
    ])
    // And next time, the same bill matches by itself.
    const next = reviewLines(bill, ctx({ aliases: saved }))
    expect(next.map((l) => [l.line.name, l.item?.id, l.match.kind])).toEqual([
      ['Beans', 'broad', 'vendor'],
      ['Thengai', 'coconut', 'vendor'],
    ])
  })
})
