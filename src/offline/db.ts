import Dexie, { type EntityTable } from 'dexie'
import type { Item, StockEvent } from '../stock/types.ts'

/**
 * A change waiting to be sent to Supabase. Ops are replayed in `seq` order.
 * - update: patch the row(s) matching `match` (for example, rename the household)
 * - insert: add a row with a client-made id; replaying twice is harmless (used for
 *   event rows such as stock_events from Batch 2)
 */
export type OutboxOp =
  | {
      seq?: number
      id: string
      kind: 'update'
      table: string
      match: Record<string, string>
      patch: Record<string, unknown>
      userId: string
      createdAt: string
      attempts: number
    }
  | {
      seq?: number
      id: string
      kind: 'insert'
      table: string
      row: Record<string, unknown> & { id: string }
      userId: string
      createdAt: string
      attempts: number
    }

/** Last known server data, so the app opens instantly and works offline. */
export interface CacheEntry {
  key: string
  value: unknown
  savedAt: string
}

export class PrabasDb extends Dexie {
  outbox!: EntityTable<OutboxOp, 'seq'>
  cache!: EntityTable<CacheEntry, 'key'>
  /** This household's items and stock events, as last seen (plus changes not yet sent). */
  items!: EntityTable<Item, 'id'>
  stock_events!: EntityTable<StockEvent, 'id'>

  constructor(name = 'prabas') {
    super(name)
    // Later batches add tables with a new version() call, never by editing this one.
    this.version(1).stores({
      outbox: '++seq, userId',
      cache: 'key',
    })
    this.version(2).stores({
      items: 'id, household_id',
      stock_events: 'id, household_id, item_id',
    })
  }

  async readCache<T>(key: string): Promise<T | null> {
    return ((await this.cache.get(key))?.value as T | undefined) ?? null
  }

  async writeCache(key: string, value: unknown): Promise<void> {
    await this.cache.put({ key, value, savedAt: new Date().toISOString() })
  }

  /** On log out: nothing from one person's session stays on the device for the next. */
  async clearAll(): Promise<void> {
    await this.transaction('rw', [this.outbox, this.cache, this.items, this.stock_events], async () => {
      await Promise.all([this.outbox.clear(), this.cache.clear(), this.items.clear(), this.stock_events.clear()])
    })
  }
}
