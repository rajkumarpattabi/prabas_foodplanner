// Dishes, as stored (see supabase/migrations/0006_dishes.sql).

export const DISH_TYPES = [
  'tiffin',
  'variety_rice',
  'kuzhambu',
  'sambar',
  'rasam',
  'poriyal',
  'kootu',
  'chutney',
  'nonveg_gravy',
  'nonveg_fry',
  'drink',
  'snack',
] as const
export type DishType = (typeof DISH_TYPES)[number]

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const
export type Meal = (typeof MEALS)[number]

export const DISH_TAGS = ['protein', 'fibre', 'greens', 'millet', 'fish', 'legume', 'curd'] as const
export type DishTag = (typeof DISH_TAGS)[number]

/** One ingredient, for five people, in the item's stored unit (g, ml, or a count). */
export interface Ingredient {
  item_id: string
  quantity: number
  /** Nice to have (garnish, a pinch of something): not needed to cook it. */
  optional?: boolean
}

export interface Dish {
  id: string
  household_id: string
  catalog_key: string | null
  name_ta: string
  name_en: string
  aliases: string[]
  type: DishType
  meals: Meal[]
  /** Worked out from the ingredients: meat, fish or egg makes it non-veg (see isVeg). */
  is_veg: boolean
  tags: DishTag[]
  ingredients: Ingredient[]
  /** Recommended sides, best first. */
  side_ids: string[]
  /** Stages for prepared items (Batch 6); unused until then. */
  prep_plan: unknown
  is_favourite: boolean
  is_kids_favourite: boolean
  /** Hidden from suggestions, but kept in the library. */
  dont_suggest: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}
