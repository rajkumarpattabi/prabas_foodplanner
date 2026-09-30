// Rules about dishes: which icon, veg or not, and editing ingredient and pairing lists.

import type { Category, Item } from '../stock/types.ts'
import type { DishType, Ingredient } from './types.ts'

/** One simple icon per kind of dish (CLAUDE.md): the twelve types share six icons. */
export type IconGroup = 'tiffin' | 'rice' | 'kuzhambu' | 'poriyal' | 'nonveg' | 'drink'

export const ICON_GROUP: Record<DishType, IconGroup> = {
  tiffin: 'tiffin',
  snack: 'tiffin',
  variety_rice: 'rice',
  kuzhambu: 'kuzhambu',
  sambar: 'kuzhambu',
  rasam: 'kuzhambu',
  poriyal: 'poriyal',
  kootu: 'poriyal',
  chutney: 'poriyal',
  nonveg_gravy: 'nonveg',
  nonveg_fry: 'nonveg',
  drink: 'drink',
}

/** Sides: what goes with a main dish. Everything else is a main. */
const SIDE_TYPES = new Set<DishType>(['kuzhambu', 'sambar', 'rasam', 'poriyal', 'kootu', 'chutney', 'nonveg_gravy', 'nonveg_fry'])
export const isSideType = (type: DishType) => SIDE_TYPES.has(type)

/** Egg counts as non-veg, as the family's food rules say. */
const NON_VEG = new Set<Category>(['meat', 'fish', 'egg'])

/**
 * Veg unless any ingredient is meat, fish or egg (optional ones too: an egg on top is
 * still egg). An ingredient whose item can't be found doesn't make it veg or non-veg.
 */
export function isVeg(ingredients: readonly Ingredient[], itemsById: ReadonlyMap<string, Pick<Item, 'category'>>): boolean {
  return !ingredients.some((i) => {
    const item = itemsById.get(i.item_id)
    return item !== undefined && NON_VEG.has(item.category)
  })
}

/** Set an ingredient's quantity, adding it at the end if new. */
export function setIngredient(list: readonly Ingredient[], next: Ingredient): Ingredient[] {
  const i = list.findIndex((x) => x.item_id === next.item_id)
  if (i < 0) return [...list, next]
  return list.map((x, j) => (j === i ? next : x))
}

export const removeIngredient = (list: readonly Ingredient[], itemId: string): Ingredient[] =>
  list.filter((x) => x.item_id !== itemId)

/** Add a side at the lowest rank. A dish can't be its own side, and each side appears once. */
export function addSide(sides: readonly string[], dishId: string, sideId: string): string[] {
  if (sideId === dishId || sides.includes(sideId)) return [...sides]
  return [...sides, sideId]
}

export const removeSide = (sides: readonly string[], sideId: string): string[] => sides.filter((s) => s !== sideId)

/** Move a side up (−1) or down (+1) one rank. */
export function moveSide(sides: readonly string[], sideId: string, by: -1 | 1): string[] {
  const i = sides.indexOf(sideId)
  const j = i + by
  if (i < 0 || j < 0 || j >= sides.length) return [...sides]
  const out = [...sides]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}
