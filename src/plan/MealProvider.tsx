import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import type { Meal } from '../dishes/types.ts'
import type { LocalDate } from '../lib/dates.ts'
import type { NewOp } from '../offline/outbox.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { MealApi } from './api.ts'
import type { Combo } from './combos.ts'
import { dishNames } from './cook.ts'
import { MealContext, type MealsStatus, type MealState, type NewLeftover } from './mealContext.ts'
import { mealId, type Leftover, type MealRecord } from './types.ts'

interface Props {
  api: MealApi
  householdId: string
  userId: string
  children: ReactNode
}

/** The fields a plan or a cook changes on a meal. */
type MealChange = Pick<MealRecord, 'dish_ids' | 'dish_names' | 'status' | 'cooked_by' | 'cooked_at'>

/** Offline-first meals and leftovers (see useTableSync), and the ways to change them. */
export function MealProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const tables = useMemo(() => ({ meals: db.meals, leftovers: db.leftovers }), [db])
  const load = useCallback(() => api.load(householdId), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `meals:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const meals = useLiveQuery(() => db.meals.where('household_id').equals(householdId).toArray(), [db, householdId])
  const leftovers = useLiveQuery(() => db.leftovers.where('household_id').equals(householdId).toArray(), [db, householdId])
  const mealsById = useMemo(() => new Map((meals ?? []).map((m) => [m.id, m])), [meals])

  /**
   * Saves a meal: an insert (ignored if the other phone made this meal first), then an
   * update with this change, so a plan or cook made offline still lands.
   */
  const put = useCallback(
    (date: LocalDate, meal: Meal, change: MealChange) => {
      const id = mealId(householdId, date, meal)
      const now = new Date().toISOString()
      const current = mealsById.get(id)
      const row: MealRecord = current
        ? { ...current, ...change, updated_by: userId, updated_at: now }
        : { id, household_id: householdId, date, meal, ...change, created_by: userId, created_at: now, updated_by: userId, updated_at: now }
      // The insert is made as me (the database only allows that); if the other phone
      // made this meal first, it's ignored and the update below applies.
      const { created_at: _c, updated_at: _u, ...insert } = { ...row, created_by: userId }
      const ops: NewOp[] = [
        { kind: 'insert', table: 'meals', row: insert, userId },
        { kind: 'update', table: 'meals', match: { id }, patch: change, userId },
      ]
      void save('meals', [row], ops)
      return current ?? null
    },
    [householdId, userId, mealsById, save],
  )

  const mealFor = useCallback((date: LocalDate, meal: Meal) => mealsById.get(mealId(householdId, date, meal)), [mealsById, householdId])

  const planMeal = useCallback(
    (date: LocalDate, meal: Meal, combo: Combo) => {
      const names = dishNames(combo)
      put(date, meal, { dish_ids: names.map((n) => n.dish_id), dish_names: names, status: 'planned', cooked_by: null, cooked_at: null })
    },
    [put],
  )

  const cookMeal = useCallback(
    (date: LocalDate, meal: Meal, combo: Combo) => {
      const names = dishNames(combo)
      return put(date, meal, {
        dish_ids: names.map((n) => n.dish_id),
        dish_names: names,
        status: 'cooked',
        cooked_by: userId,
        cooked_at: new Date().toISOString(),
      })
    },
    [put, userId],
  )

  const removeMeal = useCallback(
    (date: LocalDate, meal: Meal) => void remove('meals', mealId(householdId, date, meal)),
    [remove, householdId],
  )

  const restoreMeal = useCallback(
    (date: LocalDate, meal: Meal, before: MealRecord | null) => {
      if (!before) return removeMeal(date, meal)
      const { dish_ids, dish_names, status, cooked_by, cooked_at } = before
      put(date, meal, { dish_ids, dish_names, status, cooked_by, cooked_at })
    },
    [put, removeMeal],
  )

  const addLeftovers = useCallback(
    (list: NewLeftover[]): Leftover[] => {
      const now = new Date().toISOString()
      const rows: Leftover[] = list.map((l) => ({
        id: crypto.randomUUID(),
        household_id: householdId,
        dish_id: l.dish.id,
        name_ta: l.dish.name_ta,
        name_en: l.dish.name_en,
        meal_id: l.meal_id,
        servings: l.servings,
        expires_on: l.expires_on,
        eaten_at: null,
        eaten_by: null,
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
      }))
      const ops = rows.map(({ created_at: _c, updated_at: _u, ...row }): NewOp => ({ kind: 'insert', table: 'leftovers', row, userId }))
      void save('leftovers', rows, ops)
      return rows
    },
    [householdId, userId, save],
  )

  const setLeftoverEaten = useCallback(
    (id: string, eaten: boolean) => {
      void (async () => {
        const current = await db.leftovers.get(id)
        if (!current) return
        const patch = eaten ? { eaten_at: new Date().toISOString(), eaten_by: userId } : { eaten_at: null, eaten_by: null }
        const next = { ...current, ...patch, updated_by: userId, updated_at: new Date().toISOString() }
        await save('leftovers', [next], [{ kind: 'update', table: 'leftovers', match: { id }, patch, userId }])
      })()
    },
    [db, userId, save],
  )

  const ready = loaded === true && meals !== undefined && leftovers !== undefined
  const status: MealsStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'

  const value = useMemo<MealState>(
    () => ({
      status,
      error,
      meals: meals ?? [],
      leftovers: leftovers ?? [],
      mealFor,
      planMeal,
      removeMeal,
      cookMeal,
      restoreMeal,
      addLeftovers,
      setLeftoverEaten,
      reload,
    }),
    [status, error, meals, leftovers, mealFor, planMeal, removeMeal, cookMeal, restoreMeal, addLeftovers, setLeftoverEaten, reload],
  )
  return <MealContext.Provider value={value}>{children}</MealContext.Provider>
}
