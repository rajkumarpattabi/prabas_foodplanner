import { createContext, useContext } from 'react'
import type { Dish } from './types.ts'

export type DishStatus = 'loading' | 'error' | 'ready'

/** A new dish: names and type, plus anything that shouldn't take its default. */
export type NewDish = Pick<Dish, 'name_ta' | 'name_en' | 'type'> &
  Partial<Omit<Dish, 'id' | 'household_id' | 'catalog_key' | 'is_veg' | 'created_by' | 'created_at' | 'updated_by' | 'updated_at'>>

/** Everything about a dish that can change. Veg or not follows the ingredients. */
export type DishPatch = Partial<
  Pick<
    Dish,
    | 'name_ta'
    | 'name_en'
    | 'aliases'
    | 'type'
    | 'meals'
    | 'tags'
    | 'ingredients'
    | 'side_ids'
    | 'is_favourite'
    | 'is_kids_favourite'
    | 'dont_suggest'
    | 'notes'
  >
>

export interface DishState {
  status: DishStatus
  /** Why the first load failed (status "error"). */
  error: string | null
  dishes: Dish[]
  dishesById: ReadonlyMap<string, Dish>
  /** These apply at once, and are saved through the outbox (retried until they get through). */
  addDish: (dish: NewDish) => Dish
  updateDish: (id: string, patch: DishPatch) => void
  /** Also takes it out of other dishes' sides (the database does the same). */
  deleteDish: (id: string) => void
  reload: () => Promise<void>
}

export const DishContext = createContext<DishState | null>(null)

export function useDishes(): DishState {
  const ctx = useContext(DishContext)
  if (!ctx) throw new Error('useDishes must be used inside DishProvider')
  return ctx
}
