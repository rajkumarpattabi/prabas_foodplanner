// Food groups: which ones a meal (or a combo, or a dish) covers, from dish tags and
// the ingredients' item categories.

import type { Dish } from '../dishes/types.ts'
import type { Item } from '../stock/types.ts'

export const GROUPS = ['legume', 'protein', 'greens', 'variety', 'millet', 'fish', 'curd'] as const
export type Group = (typeof GROUPS)[number]

/** For "Adds …", "More … : try …". */
export const GROUP_WORDS: Record<Group, string> = {
  legume: 'legumes',
  protein: 'protein',
  greens: 'greens',
  variety: 'vegetables',
  millet: 'millets',
  fish: 'fish',
  curd: 'curd',
}

export const GROUP_TITLES: Record<Group, string> = {
  legume: 'Legumes',
  protein: 'Protein-rich meals',
  greens: 'Greens',
  variety: 'Vegetables',
  millet: 'Millets',
  fish: 'Fish',
  curd: 'Curd',
}

const PROTEIN_ITEMS = new Set(['meat', 'fish', 'egg', 'dal'])

export interface Cover {
  groups: Set<Group>
  /** The vegetables in it (item ids), for variety. */
  vegetables: Set<string>
}

/** What these dishes cover between them. */
export function cover(dishes: readonly Dish[], itemsById: ReadonlyMap<string, Pick<Item, 'category'>>): Cover {
  const groups = new Set<Group>()
  const vegetables = new Set<string>()
  for (const d of dishes) {
    for (const t of d.tags) if (t === 'legume' || t === 'protein' || t === 'greens' || t === 'millet' || t === 'fish' || t === 'curd') groups.add(t)
    for (const ing of d.ingredients) {
      if (ing.optional) continue
      const category = itemsById.get(ing.item_id)?.category
      if (category === 'greens') groups.add('greens')
      if (category === 'fish') groups.add('fish')
      if (category && PROTEIN_ITEMS.has(category)) groups.add('protein')
      if (category === 'vegetable') vegetables.add(ing.item_id)
    }
  }
  if (groups.has('legume')) groups.add('protein')
  if (vegetables.size) groups.add('variety')
  return { groups, vegetables }
}
