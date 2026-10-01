import { createContext, useContext } from 'react'
import type { Dish, Meal } from '../dishes/types.ts'
import type { LocalDate } from '../lib/dates.ts'
import type { Combo } from './combos.ts'
import type { Leftover, MealRecord } from './types.ts'

export type MealsStatus = 'loading' | 'error' | 'ready'

export interface NewLeftover {
  dish: Dish
  servings: number
  expires_on: LocalDate
  meal_id: string | null
}

export interface MealState {
  status: MealsStatus
  error: string | null
  meals: MealRecord[]
  leftovers: Leftover[]
  mealFor: (date: LocalDate, meal: Meal) => MealRecord | undefined
  /** Plan this combo for the meal, or change the plan. Applies at once; saved through the outbox. */
  planMeal: (date: LocalDate, meal: Meal, combo: Combo) => void
  /** Take the plan away. */
  removeMeal: (date: LocalDate, meal: Meal) => void
  /** Mark the meal cooked with this combo. Returns how it was before, for undo. */
  cookMeal: (date: LocalDate, meal: Meal, combo: Combo) => MealRecord | null
  /** Put a meal back as it was (for undo); null removes it. */
  restoreMeal: (date: LocalDate, meal: Meal, before: MealRecord | null) => void
  addLeftovers: (leftovers: NewLeftover[]) => Leftover[]
  setLeftoverEaten: (id: string, eaten: boolean) => void
  /** Good until the end of this day. */
  setLeftoverExpiry: (id: string, expiresOn: LocalDate) => void
  reload: () => Promise<void>
}

export const MealContext = createContext<MealState | null>(null)

export function useMeals(): MealState {
  const ctx = useContext(MealContext)
  if (!ctx) throw new Error('useMeals must be used inside MealProvider')
  return ctx
}
