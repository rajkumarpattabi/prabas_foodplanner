// Planned and cooked meals, and leftovers, as stored (see supabase/migrations/0008_meals.sql).

import type { DishType, Meal } from '../dishes/types.ts'
import type { LocalDate } from '../lib/dates.ts'

export type MealStatus = 'planned' | 'cooked'

/** The dish names as they were when planned or cooked, so history outlives a deleted dish. */
export interface MealDishName {
  dish_id: string
  name_ta: string
  name_en: string
  type: DishType
}

/** One meal of one day: planned, then cooked. There's one per household, date and meal. */
export interface MealRecord {
  /** `<household id>:<date>:<meal>`, so both phones planning the same meal land on the same record. */
  id: string
  household_id: string
  date: LocalDate
  meal: Meal
  /** The main dish first, then its sides. */
  dish_ids: string[]
  dish_names: MealDishName[]
  status: MealStatus
  cooked_by: string | null
  cooked_at: string | null
  /** created_by is who planned it (or cooked it, if it wasn't planned first). */
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

/** Leftover servings of a cooked dish: eaten or not. */
export interface Leftover {
  id: string
  household_id: string
  /** Null if the dish has since been deleted; the names stay. */
  dish_id: string | null
  name_ta: string
  name_en: string
  meal_id: string | null
  servings: number
  /** Good until the end of this day. */
  expires_on: LocalDate
  eaten_at: string | null
  eaten_by: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export const mealId = (householdId: string, date: LocalDate, meal: Meal) => `${householdId}:${date}:${meal}`
