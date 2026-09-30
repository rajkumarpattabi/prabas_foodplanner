import type { EntityTable, IDType } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NewOp } from '../offline/outbox.ts'
import { useSync } from '../offline/syncContext.ts'
import type { RemoteChange, StockApi, StockTable } from './api.ts'
import { mergeRows } from './merge.ts'
import { StockContext, type ItemPatch, type NewItem, type NewStockEvent, type StockState, type StockStatus } from './stockContext.ts'
import type { Item, StockEvent } from './types.ts'
import { defaultStep } from './units.ts'

// Long enough to outlast any reload that started before a write.
const RECENT_MS = 5 * 60_000
const RELOAD_DEBOUNCE_MS = 300

interface Props {
  api: StockApi
  householdId: string
  userId: string
  children: ReactNode
}

/**
 * Offline-first items and stock. The local database is what the screens read:
 * 1. open from what this device saved last time, instantly
 * 2. reload everything from Supabase on open and on returning to the app, keeping
 *    changes the server hasn't seen yet
 * 3. apply live changes from the other phone row by row
 * 4. writes land locally at once and go through the outbox
 */
export function StockProvider({ api, householdId, userId, children }: Props) {
  const { db, outbox } = useSync()
  const loadedKey = `stock:${householdId}`
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recent = useRef(new Map<string, number>())

  const items = useLiveQuery(() => db.items.where('household_id').equals(householdId).toArray(), [db, householdId])
  const events = useLiveQuery(
    () => db.stock_events.where('household_id').equals(householdId).toArray(),
    [db, householdId],
  )

  const pendingOps = useCallback(() => db.outbox.where('userId').equals(userId).toArray(), [db, userId])

  const loadOnce = useCallback(async () => {
    const fetchedFrom = Date.now()
    const server = await api.load(householdId)
    await db.transaction('rw', [db.items, db.stock_events, db.outbox, db.cache], async () => {
      const pending = await pendingOps()
      const replace = async <T extends { id: string }>(table: EntityTable<T, 'id'>, name: StockTable, rows: T[]) => {
        const local = await table.where('household_id').equals(householdId).toArray()
        const next = mergeRows({ table: name, server: rows, local, pending, recent: recent.current, fetchedFrom })
        const keep = new Set(next.map((r) => r.id))
        await table.bulkDelete(local.filter((r) => !keep.has(r.id)).map((r) => r.id as IDType<T, 'id'>))
        await table.bulkPut(next)
      }
      await replace(db.items, 'items', server.items)
      await replace(db.stock_events, 'stock_events', server.events)
      await db.cache.put({ key: loadedKey, value: true, savedAt: new Date().toISOString() })
    })
  }, [api, db, householdId, loadedKey, pendingOps])

  // One reload at a time; asking during one runs another straight after.
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  const reload = useCallback((): Promise<void> => {
    if (running.current) {
      again.current = true
      return running.current
    }
    running.current = (async () => {
      try {
        do {
          again.current = false
          try {
            await loadOnce()
            setLoaded(true)
            setError(null)
          } catch (e) {
            // With stock already on this device, stay quiet and show that.
            setError((e as Error)?.message ?? 'Something went wrong.')
          }
        } while (again.current)
      } finally {
        running.current = null
      }
    })()
    return running.current
  }, [loadOnce])

  // Open from this device's copy, then refresh.
  useEffect(() => {
    let active = true
    void (async () => {
      const had = (await db.cache.get(loadedKey)) !== undefined
      if (active) setLoaded((was) => was || had)
      if (active) await reload()
    })()
    return () => {
      active = false
    }
  }, [db, loadedKey, reload])

  // Live changes, one row at a time. Queued edits to an item stay on top.
  useEffect(() => {
    const apply = async (change: RemoteChange) => {
      if (change.table === 'stock_events') {
        await db.stock_events.put(change.row)
        return
      }
      const pending = await pendingOps()
      const patched = pending.reduce<Item>(
        (row, op) =>
          op.kind === 'update' && op.table === 'items' && op.match.id === row.id ? { ...row, ...(op.patch as ItemPatch) } : row,
        change.row,
      )
      await db.items.put(patched)
    }
    return api.subscribe(householdId, (change) => void apply(change))
  }, [api, db, householdId, pendingOps])

  // Phones drop live connections while asleep, so catch up on return. A refused
  // change is undone by reloading.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }
    const onVisible = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', onVisible)
    const stopReject = outbox.onReject((op) => {
      if (op.table === 'items' || op.table === 'stock_events') soon()
    })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stopReject()
    }
  }, [outbox, reload])

  /** Remember the write (so a reload already under way can't drop it), save it here, then queue it. */
  const save = useCallback(
    async <T extends { id: string }>(table: EntityTable<T, 'id'>, rows: T[], ops: NewOp[]) => {
      const now = Date.now()
      for (const [id, at] of recent.current) if (now - at > RECENT_MS) recent.current.delete(id)
      for (const r of rows) recent.current.set(r.id, now)
      await table.bulkPut(rows)
      for (const op of ops) await outbox.enqueue(op)
    },
    [outbox],
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
      void save(db.items, [item], [{ kind: 'insert', table: 'items', row, userId }])
      return item
    },
    [db, householdId, userId, save],
  )

  const updateItem = useCallback(
    (id: string, patch: ItemPatch) => {
      void (async () => {
        const current = await db.items.get(id)
        if (!current) return
        const next = { ...current, ...patch, updated_by: userId, updated_at: new Date().toISOString() }
        await save(db.items, [next], [{ kind: 'update', table: 'items', match: { id }, patch, userId }])
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
      void save(db.stock_events, rows, ops)
      return rows
    },
    [db, householdId, userId, save],
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
