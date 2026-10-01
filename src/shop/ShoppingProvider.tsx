import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import { addDays, localDate } from '../lib/dates.ts'
import { useClock } from '../lib/clock.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { ShoppingApi } from './api.ts'
import { SHOP } from './build.ts'
import { ShoppingContext, type ShoppingState, type ShoppingStatus } from './shoppingContext.ts'
import type { SectionKey, ShoppingItem } from './types.ts'

interface Props {
  api: ShoppingApi
  householdId: string
  userId: string
  children: ReactNode
}

/** Offline-first shopping lines (see useTableSync), and the ways to change them. */
export function ShoppingProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const clock = useClock()
  const tables = useMemo(() => ({ shopping_items: db.shopping_items }), [db])
  const load = useCallback(async () => ({ shopping_items: await api.load(householdId) }), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `shopping:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const rows = useLiveQuery(() => db.shopping_items.where('household_id').equals(householdId).toArray(), [db, householdId])

  const insert = useCallback(
    (fields: Pick<ShoppingItem, 'item_id' | 'kind'> & Partial<ShoppingItem>): ShoppingItem => {
      const now = new Date().toISOString()
      const row: ShoppingItem = {
        id: crypto.randomUUID(),
        household_id: householdId,
        quantity: null,
        skip_until: null,
        section: null,
        done_at: null,
        done_by: null,
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
        ...fields,
      }
      // Supabase stamps the times.
      const { created_at: _c, updated_at: _u, ...server } = row
      void save('shopping_items', [row], [{ kind: 'insert', table: 'shopping_items', row: server, userId }])
      return row
    },
    [householdId, userId, save],
  )

  const update = useCallback(
    async (id: string, patch: Partial<Pick<ShoppingItem, 'quantity' | 'done_at' | 'done_by'>>) => {
      const current = await db.shopping_items.get(id)
      if (!current) return
      const next = { ...current, ...patch, updated_by: userId, updated_at: new Date().toISOString() }
      await save('shopping_items', [next], [{ kind: 'update', table: 'shopping_items', match: { id }, patch, userId }])
    },
    [db, userId, save],
  )

  const addWant = useCallback(
    (itemId: string, quantity: number | null = null): ShoppingItem => {
      // Already on the list: one line per item, so just the amount changes.
      const open = rows?.find((r) => r.item_id === itemId && r.kind === 'want' && !r.done_at)
      if (open) {
        if (quantity !== null) void update(open.id, { quantity })
        return { ...open, quantity: quantity ?? open.quantity }
      }
      return insert({ item_id: itemId, kind: 'want', quantity })
    },
    [rows, insert, update],
  )

  const setBought = useCallback(
    (id: string, bought: boolean) => void update(id, bought ? { done_at: clock().toISOString(), done_by: userId } : { done_at: null, done_by: null }),
    [update, clock, userId],
  )

  const skip = useCallback(
    (itemId: string, section: SectionKey) =>
      insert({ item_id: itemId, kind: 'skip', section, skip_until: addDays(localDate(clock()), SHOP.skipDays - 1) }),
    [insert, clock],
  )

  const removeRow = useCallback((id: string) => void remove('shopping_items', id), [remove])

  const ready = loaded === true && rows !== undefined
  const status: ShoppingStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'
  const value = useMemo<ShoppingState>(
    () => ({ status, error, rows: rows ?? [], addWant, setBought, skip, removeRow, reload }),
    [status, error, rows, addWant, setBought, skip, removeRow, reload],
  )
  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>
}
