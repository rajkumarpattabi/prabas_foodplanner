import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import type { NewOp } from '../offline/outbox.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { StockApi } from './api.ts'
import { StockContext, type ItemPatch, type NewItem, type NewStockEvent, type StockState, type StockStatus } from './stockContext.ts'
import type { Item, StockEvent } from './types.ts'
import { defaultStep } from './units.ts'

interface Props {
  api: StockApi
  householdId: string
  userId: string
  children: ReactNode
}

/** Offline-first items and stock events (see useTableSync), and the ways to change them. */
export function StockProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const tables = useMemo(() => ({ items: db.items, stock_events: db.stock_events }), [db])
  const load = useCallback(async () => {
    const server = await api.load(householdId)
    return { items: server.items, stock_events: server.events }
  }, [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save } = useTableSync({
    householdId,
    userId,
    cacheKey: `stock:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const items = useLiveQuery(() => db.items.where('household_id').equals(householdId).toArray(), [db, householdId])
  const events = useLiveQuery(
    () => db.stock_events.where('household_id').equals(householdId).toArray(),
    [db, householdId],
  )

  const addItem = useCallback(
    (input: NewItem): Item => {
      const now = new Date().toISOString()
      const item: Item = {
        aliases: [],
        display_unit: input.unit,
        shelf_life_days: null,
        is_staple: false,
        low_threshold: null,
        piece_weight_g: null,
        has_opened_form: false,
        opened_shelf_life_days: null,
        step: defaultStep(input.unit),
        archived: false,
        ...input,
        id: crypto.randomUUID(),
        household_id: householdId,
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
      }
      // Supabase stamps the times.
      const { created_at: _c, updated_at: _u, ...row } = item
      void save('items', [item], [{ kind: 'insert', table: 'items', row, userId }])
      return item
    },
    [householdId, userId, save],
  )

  const updateItem = useCallback(
    (id: string, patch: ItemPatch) => {
      void (async () => {
        const current = await db.items.get(id)
        if (!current) return
        const next = { ...current, ...patch, updated_by: userId, updated_at: new Date().toISOString() }
        await save('items', [next], [{ kind: 'update', table: 'items', match: { id }, patch, userId }])
      })()
    },
    [db, userId, save],
  )

  const record = useCallback(
    (inputs: NewStockEvent[]): StockEvent[] => {
      const now = new Date().toISOString()
      const rows: StockEvent[] = inputs.map((e) => ({
        reason: null,
        batch_id: null,
        expires_on: null,
        form: 'whole',
        note: null,
        occurred_at: now,
        ...e,
        id: crypto.randomUUID(),
        household_id: householdId,
        created_by: userId,
        created_at: now,
      }))
      const ops = rows.map(({ created_at: _c, ...row }): NewOp => ({ kind: 'insert', table: 'stock_events', row, userId }))
      void save('stock_events', rows, ops)
      return rows
    },
    [householdId, userId, save],
  )

  const eventsByItem = useMemo(() => {
    const map = new Map<string, StockEvent[]>()
    for (const e of events ?? []) {
      const list = map.get(e.item_id)
      if (list) list.push(e)
      else map.set(e.item_id, [e])
    }
    return map
  }, [events])

  const ready = loaded === true && items !== undefined && events !== undefined
  const status: StockStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'

  const value = useMemo<StockState>(
    () => ({ status, error, items: items ?? [], eventsByItem, addItem, updateItem, record, reload }),
    [status, error, items, eventsByItem, addItem, updateItem, record, reload],
  )
  return <StockContext.Provider value={value}>{children}</StockContext.Provider>
}
