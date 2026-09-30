import type { Table } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OutboxOp } from './db.ts'
import { mergeRows, withPending } from './merge.ts'
import type { NewOp } from './outbox.ts'
import { useSync } from './syncContext.ts'

// Long enough to outlast any reload that started before a write.
const RECENT_MS = 5 * 60_000
const RELOAD_DEBOUNCE_MS = 300

type Row = { id: string }

function forgetOld(map: Map<string, number>, now: number) {
  for (const [id, at] of map) if (now - at > RECENT_MS) map.delete(id)
}

/** A row that changed on another device (or this one's own write echoed back), or one deleted there. */
export type TableChange = { table: string; row: Row } | { table: string; deletedId: string }

interface Options {
  householdId: string
  userId: string
  /** Marks that this device has loaded these tables at least once. */
  cacheKey: string
  /** The local tables, by server table name. Rows carry household_id. */
  tables: Readonly<Record<string, Table>>
  /** Every row of every table, from the server. */
  load: () => Promise<Record<string, Row[]>>
  /** Live changes from the server; returns a function that stops them. */
  subscribe: (onChange: (change: TableChange) => void) => () => void
}

export interface TableSync {
  /** null until this device's copy has been checked; then whether it has one. */
  loaded: boolean | null
  /** Why the last reload failed, if it did. */
  error: string | null
  /** Read everything again from the server (after a restore, for example). */
  reload: () => Promise<void>
  /** Save rows here at once, then queue their ops for the server. */
  save: (table: string, rows: Row[], ops: NewOp[]) => Promise<void>
  /** Delete a row here at once, then queue its deletion. */
  remove: (table: string, id: string) => Promise<void>
}

/**
 * Offline-first sync for household tables. The local database is what screens read:
 * 1. open from what this device saved last time, instantly
 * 2. reload everything from Supabase on open and on returning to the app, keeping
 *    changes the server hasn't seen yet (see mergeRows)
 * 3. apply live changes from the other phone row by row
 * 4. writes land locally at once and go through the outbox, retried until saved
 */
export function useTableSync({ householdId, userId, cacheKey, tables, load, subscribe }: Options): TableSync {
  const { db, outbox } = useSync()
  const [loaded, setLoaded] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recent = useRef(new Map<string, number>())
  const deleted = useRef(new Map<string, number>())

  const pendingOps = useCallback(() => db.outbox.where('userId').equals(userId).toArray(), [db, userId])

  const loadOnce = useCallback(async () => {
    const fetchedFrom = Date.now()
    const server = await load()
    await db.transaction('rw', [...Object.values(tables), db.outbox, db.cache], async () => {
      const pending = await pendingOps()
      for (const [name, table] of Object.entries(tables)) {
        const local = (await table.where('household_id').equals(householdId).toArray()) as Row[]
        const next = mergeRows({
          table: name,
          server: server[name] ?? [],
          local,
          pending,
          recent: recent.current,
          deleted: deleted.current,
          fetchedFrom,
        })
        const keep = new Set(next.map((r) => r.id))
        await table.bulkDelete(local.filter((r) => !keep.has(r.id)).map((r) => r.id))
        await table.bulkPut(next)
      }
      await db.cache.put({ key: cacheKey, value: true, savedAt: new Date().toISOString() })
    })
  }, [load, db, tables, pendingOps, householdId, cacheKey])

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
            // With data already on this device, stay quiet and show that.
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
      const had = (await db.cache.get(cacheKey)) !== undefined
      if (active) setLoaded((was) => was || had)
      if (active) await reload()
    })()
    return () => {
      active = false
    }
  }, [db, cacheKey, reload])

  // Live changes, one row at a time. Edits and deletes queued here stay on top.
  useEffect(() => {
    const apply = async (change: TableChange) => {
      const table = tables[change.table]
      if (!table) return
      if ('deletedId' in change) {
        await table.delete(change.deletedId)
        return
      }
      const row = withPending(change.table, change.row, await pendingOps())
      if (row) await table.put(row)
    }
    return subscribe((change) => void apply(change))
  }, [subscribe, tables, pendingOps])

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
    const stopReject = outbox.onReject((op: OutboxOp) => {
      if (op.table in tables) soon()
    })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stopReject()
    }
  }, [outbox, reload, tables])

  const save = useCallback(
    async (table: string, rows: Row[], ops: NewOp[]) => {
      const now = Date.now()
      forgetOld(recent.current, now)
      // Remember the write, so a reload already under way can't drop it.
      for (const r of rows) recent.current.set(r.id, now)
      await tables[table].bulkPut(rows)
      for (const op of ops) await outbox.enqueue(op)
    },
    [tables, outbox],
  )

  const remove = useCallback(
    async (table: string, id: string) => {
      const now = Date.now()
      forgetOld(deleted.current, now)
      deleted.current.set(id, now)
      recent.current.delete(id)
      await tables[table].delete(id)
      await outbox.enqueue({ kind: 'delete', table, match: { id }, userId })
    },
    [tables, outbox, userId],
  )

  return { loaded, error, reload, save, remove }
}
