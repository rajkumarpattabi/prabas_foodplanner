import { describe, expect, test } from 'vitest'
import { dishForm, dishPatch, EMPTY_DISH_FORM, newDishFrom, reverseDishPatch, toggle } from './dishEdit.ts'
import { MEALS, type Dish, type Meal } from './types.ts'

const pongal: Dish = {
  id: 'pongal',
  household_id: 'hh',
  catalog_key: 'ven_pongal',
  name_ta: 'வெண் பொங்கல்',
  name_en: 'Ven pongal',
  aliases: ['pongal'],
  type: 'tiffin',
  meals: ['breakfast'],
  is_veg: true,
  tags: [],
  ingredients: [{ item_id: 'rice', quantity: 400 }],
  side_ids: ['sambar', 'chutney'],
  prep_plan: null,
  uses_prepared: [],
  is_favourite: true,
  is_kids_favourite: false,
  dont_suggest: false,
  notes: null,
  created_by: null,
  created_at: '',
  updated_by: null,
  updated_at: '',
}

describe('editing a dish', () => {
  test('an unchanged form changes nothing, not even the flags', () => {
    expect(dishPatch(pongal, dishForm(pongal))).toEqual({ patch: {} })
  })

  test('only what changed is saved', () => {
    const form = { ...dishForm(pongal), name_en: ' Pongal ', meals: toggle<Meal>(['breakfast'], 'dinner', MEALS), side_ids: ['chutney', 'sambar'] }
    expect(dishPatch(pongal, form)).toEqual({ patch: { name_en: 'Pongal', meals: ['breakfast', 'dinner'], side_ids: ['chutney', 'sambar'] } })
  })

  test('blank notes are saved as none', () => {
    expect(dishPatch({ ...pongal, notes: 'Add ghee last' }, { ...dishForm(pongal), notes: '  ' })).toEqual({ patch: { notes: null } })
  })

  test.each([
    [{ name_ta: ' ' }, 'Both names are needed.'],
    [{ meals: [] }, 'Pick at least one meal.'],
    [{ side_ids: Array.from({ length: 11 }, (_, i) => `s${i}`) }, 'Up to 10 sides.'],
  ])('%o is refused: %s', (change, error) => {
    expect(dishPatch(pongal, { ...dishForm(pongal), ...change })).toEqual({ error })
  })

  test('undo puts back the old values', () => {
    expect(reverseDishPatch(pongal, { name_en: 'Pongal', side_ids: [] })).toEqual({ name_en: 'Ven pongal', side_ids: ['sambar', 'chutney'] })
  })
})

describe('a new dish', () => {
  test('from the form, trimmed, with other names split', () => {
    const result = newDishFrom({ ...EMPTY_DISH_FORM, name_ta: 'கொள்ளு ரசம்', name_en: 'Kollu rasam', type: 'rasam', meals: ['lunch'], aliases: 'kollu rasam, horse gram rasam' })
    expect(result).toMatchObject({ dish: { name_en: 'Kollu rasam', type: 'rasam', meals: ['lunch'], aliases: ['kollu rasam', 'horse gram rasam'], notes: null } })
  })

  test('needs names and a meal', () => {
    expect(newDishFrom(EMPTY_DISH_FORM)).toEqual({ error: 'Both names are needed.' })
  })

  test('toggling keeps the usual order', () => {
    expect(toggle(['dinner'], 'breakfast', MEALS)).toEqual(['breakfast', 'dinner'])
    expect(toggle(['breakfast', 'dinner'], 'breakfast', MEALS)).toEqual(['dinner'])
  })
})
