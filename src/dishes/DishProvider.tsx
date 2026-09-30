import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import { useStock } from '../stock/stockContext.ts'
import type { DishApi } from './api.ts'
import { DishContext, type DishPatch, type DishState, type DishStatus, type NewDish } from './dishContext.ts'
import { isVeg } from './rules.ts'
import type { Dish } from './types.ts'

interface Props {
  api: DishApi
  householdId: string
  userId: string
  children: ReactNode
}

/**
 * Offline-first dishes (see useTableSync), and the ways to change them. Sits inside
 * StockProvider: whether a dish is veg is worked out from its ingredients' items.
 */
export function DishProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const { items } = useStock()
  const tables = useMemo(() => ({ dishes: db.dishes }), [db])
  const load = useCallback(async () => ({ dishes: await api.load(householdId) }), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `dishes:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const dishes = useLiveQuery(() => db.dishes.where('household_id').equals(householdId).toArray(), [db, householdId])
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const addDish = useCallback(
    (input: NewDish): Dish => {
      const now = new Date().toISOString()
      const dish: Dish = {
        aliases: [],
        meals: [],
        tags: [],
        ingredients: [],
        side_ids: [],
        prep_plan: null,
        is_favourite: false,
        is_kids_favourite: false,
        dont_suggest: false,
        notes: null,
        ...input,
        is_veg: isVeg(input.ingredients ?? [], itemsById),
        id: crypto.randomUUID(),
        household_id: householdId,
        catalog_key: null,
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
      }
      // Supabase stamps the times.
      const { created_at: _c, updated_at: _u, ...row } = dish
      void save('dishes', [dish], [{ kind: 'insert', table: 'dishes', row, userId }])
      return dish
    },
    [householdId, userId, itemsById, save],
  )

  const updateDish = useCallback(
    (id: string, patch: DishPatch) => {
      void (async () => {
        const current = await db.dishes.get(id)
        if (!current) return
        const full = patch.ingredients ? { ...patch, is_veg: isVeg(patch.ingredients, itemsById) } : patch
        const next = { ...current, ...full, updated_by: userId, updated_at: new Date().toISOString() }
        await save('dishes', [next], [{ kind: 'update', table: 'dishes', match: { id }, patch: full, userId }])
      })()
    },
    [db, userId, itemsById, save],
  )

  const deleteDish = useCallback(
    (id: string) => {
      void (async () => {
        await remove('dishes', id)
        // The database takes it out of other dishes' sides; do the same here meanwhile.
        const pointing = (await db.dishes.where('household_id').equals(householdId).toArray()).filter((d) => d.side_ids.includes(id))
        await db.dishes.bulkPut(pointing.map((d) => ({ ...d, side_ids: d.side_ids.filter((s) => s !== id) })))
      })()
    },
    [db, householdId, remove],
  )

  const dishesById = useMemo(() => new Map((dishes ?? []).map((d) => [d.id, d])), [dishes])
  const ready = loaded === true && dishes !== undefined
  const status: DishStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'

  const value = useMemo<DishState>(
    () => ({ status, error, dishes: dishes ?? [], dishesById, addDish, updateDish, deleteDish, reload }),
    [status, error, dishes, dishesById, addDish, updateDish, deleteDish, reload],
  )
  return <DishContext.Provider value={value}>{children}</DishContext.Provider>
}
