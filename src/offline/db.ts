import Dexie, { type EntityTable } from 'dexie'
import type { CalendarDay } from '../calendar/types.ts'
import type { Dish } from '../dishes/types.ts'
import type { Leftover, MealRecord } from '../plan/types.ts'
import type { Item, StockEvent } from '../stock/types.ts'

/**
 * A change waiting to be sent to Supabase. Ops are replayed in `seq` order.
 * - update: patch the row(s) matching `match` (for example, rename the household)
 * - insert: add a row with a client-made id; replaying twice is harmless (used for
 *   event rows such as stock_events from Batch 2)
 * - delete: remove the row(s) matching `match` (a dish); replaying twice is harmless
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
      kind: 'delete'
      table: string
      match: Record<string, string>
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
  dishes!: EntityTable<Dish, 'id'>
  meals!: EntityTable<MealRecord, 'id'>
  leftovers!: EntityTable<Leftover, 'id'>
  calendar_days!: EntityTable<CalendarDay, 'id'>

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
    this.version(3).stores({
      dishes: 'id, household_id',
    })
    this.version(4).stores({
      meals: 'id, household_id, date',
      leftovers: 'id, household_id',
    })
    this.version(5).stores({
      calendar_days: 'id, household_id, date',
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
    const tables = [this.outbox, this.cache, this.items, this.stock_events, this.dishes, this.meals, this.leftovers, this.calendar_days]
    await this.transaction('rw', tables, async () => {
      await Promise.all(tables.map((t) => t.clear()))
    })
  }
}
