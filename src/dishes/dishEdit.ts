// Adding and editing a dish: the form, and the dish or change it makes.

import { parseAliases } from '../stock/itemEdit.ts'
import type { DishPatch, NewDish } from './dishContext.ts'
import type { Dish, DishTag, DishType, Ingredient, Meal } from './types.ts'

export interface DishForm {
  name_ta: string
  name_en: string
  /** Comma-separated. */
  aliases: string
  type: DishType
  meals: Meal[]
  tags: DishTag[]
  ingredients: Ingredient[]
  side_ids: string[]
  notes: string
}

export const EMPTY_DISH_FORM: DishForm = {
  name_ta: '',
  name_en: '',
  aliases: '',
  type: 'tiffin',
  meals: [],
  tags: [],
  ingredients: [],
  side_ids: [],
  notes: '',
}

export function dishForm(dish: Dish): DishForm {
  return {
    name_ta: dish.name_ta,
    name_en: dish.name_en,
    aliases: dish.aliases.join(', '),
    type: dish.type,
    meals: [...dish.meals],
    tags: [...dish.tags],
    ingredients: dish.ingredients.map((i) => ({ ...i })),
    side_ids: [...dish.side_ids],
    notes: dish.notes ?? '',
  }
}

/** Add or remove one value from a list, keeping the given order (breakfast before lunch…). */
export function toggle<T>(list: readonly T[], value: T, order: readonly T[]): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  return order.filter((v) => next.includes(v))
}

type Checked = { values: Required<DishPatch> } | { error: string }

function check(form: DishForm): Checked {
  const name_ta = form.name_ta.trim()
  const name_en = form.name_en.trim()
  if (!name_ta || !name_en) return { error: 'Both names are needed.' }
  if (name_ta.length > 80 || name_en.length > 80) return { error: 'Names can be up to 80 letters.' }
  if (!form.meals.length) return { error: 'Pick at least one meal.' }
  const aliases = parseAliases(form.aliases)
  if (aliases.length > 40) return { error: 'Up to 40 other names.' }
  if (form.side_ids.length > 10) return { error: 'Up to 10 sides.' }
  const notes = form.notes.trim()
  if (notes.length > 1000) return { error: 'Notes can be up to 1000 letters.' }
  return {
    values: {
      name_ta,
      name_en,
      aliases,
      type: form.type,
      meals: form.meals,
      tags: form.tags,
      ingredients: form.ingredients,
      side_ids: form.side_ids,
      is_favourite: false,
      is_kids_favourite: false,
      dont_suggest: false,
      notes: notes || null,
    },
  }
}

/** A new dish from the form, or what to fix. */
export function newDishFrom(form: DishForm): { dish: NewDish } | { error: string } {
  const checked = check(form)
  if ('error' in checked) return checked
  return { dish: checked.values }
}

const FORM_FIELDS = ['name_ta', 'name_en', 'aliases', 'type', 'meals', 'tags', 'ingredients', 'side_ids', 'notes'] as const

/** Only what changed (flags are set from the detail sheet, not here), or what to fix. */
export function dishPatch(dish: Dish, form: DishForm): { patch: DishPatch } | { error: string } {
  const checked = check(form)
  if ('error' in checked) return checked
  const patch: Record<string, unknown> = {}
  for (const key of FORM_FIELDS) {
    if (JSON.stringify(checked.values[key]) !== JSON.stringify(dish[key])) patch[key] = checked.values[key]
  }
  return { patch: patch as DishPatch }
}

/** The values a patch replaces, for undo. */
export function reverseDishPatch(dish: Dish, patch: DishPatch): DishPatch {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof DishPatch)[]) out[key] = dish[key]
  return out as DishPatch
}
