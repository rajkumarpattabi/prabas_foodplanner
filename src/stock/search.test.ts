import { describe, expect, test } from 'vitest'
import { fold, searchItems } from './search.ts'

const item = (id: string, name_ta: string, name_en: string, aliases: string[]) => ({ id, name_ta, name_en, aliases })

const items = [
  item('okra', 'வெண்டைக்காய்', 'Ladies finger', ['vendakkai', 'lady finger', 'okra', 'bhindi', 'L.Finger']),
  item('brinjal', 'கத்தரிக்காய்', 'Brinjal', ['kathirikai', 'eggplant', 'baingan', 'Brinjal Big']),
  item('onion', 'பெரிய வெங்காயம்', 'Onion', ['periya vengayam', 'big onion', 'pyaz', 'Onion Big']),
  item('shallot', 'சின்ன வெங்காயம்', 'Small onion', ['chinna vengayam', 'shallots', 'sambar onion', 'Sml Onion']),
  item('greens', 'முருங்கைக்கீரை', 'Drumstick leaves', ['murungai keerai', 'moringa leaves']),
  item('curry', 'கறிவேப்பிலை', 'Curry leaves', ['karuveppilai', 'kadi patta']),
]
const ids = (q: string) => searchItems(items, q).map((i) => i.id)

describe('the Batch 2 "done when" searches all find ladies finger', () => {
  test('Tamil script: வெண்டை', () => expect(ids('வெண்டை')[0]).toBe('okra'))
  test('Tanglish: vendakkai', () => expect(ids('vendakkai')[0]).toBe('okra'))
  test('Tanglish, one k: vendakai', () => expect(ids('vendakai')[0]).toBe('okra'))
  test('English: okra', () => expect(ids('okra')[0]).toBe('okra'))
})

describe('searchItems', () => {
  test('more spellings of the same word', () => {
    expect(ids('vendaikkai')[0]).toBe('okra')
    expect(ids('Vendakkaai')[0]).toBe('okra')
    expect(ids('bhindi')).toEqual(['okra'])
    expect(ids('lady fingers')[0]).toBe('okra')
  })

  test('prefixes, as people type', () => {
    expect(ids('ven')).toContain('okra')
    expect(ids('kath')[0]).toBe('brinjal') // "kadi patta" also matches: d and t fold together
    expect(ids('கத்த')).toEqual(['brinjal'])
  })

  test('big and small onion stay apart, but "onion" finds both', () => {
    expect(ids('chinna vengayam')).toEqual(['shallot'])
    expect(ids('sinna vengayam')[0]).toBe('shallot')
    expect(ids('periya')).toEqual(['onion'])
    expect(ids('onion').sort()).toEqual(['onion', 'shallot'])
  })

  test('greens: keerai and kirai are the same', () => {
    expect(ids('murungai kirai')[0]).toBe('greens')
    expect(ids('keerai')).toContain('greens')
  })

  test('small typos in longer words', () => {
    expect(ids('brinjel')).toEqual(['brinjal'])
    expect(ids('karuvepilai')[0]).toBe('curry')
  })

  test('bill shorthand', () => {
    expect(ids('L.Finger')[0]).toBe('okra')
    expect(ids('Sml Onion')[0]).toBe('shallot')
  })

  test('nothing for an empty query or a word that is nowhere', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
    expect(ids('pizza')).toEqual([])
  })
})

describe('fold', () => {
  test('Tanglish variants land on one key; Tamil script is untouched', () => {
    expect(fold('vendakkai')).toBe(fold('vendakai'))
    expect(fold('keerai')).toBe(fold('kirai'))
    expect(fold('thakkali')).toBe(fold('takali'))
    expect(fold('வெண்டைக்காய்')).toBe('வெண்டைக்காய்')
  })
})
