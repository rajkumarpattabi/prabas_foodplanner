import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { Item, StockEvent } from './types.ts'

export type StockTable = 'items' | 'stock_events'

/** A row that changed on another device (or this one's own write, echoed back). */
export type RemoteChange = { table: 'items'; row: Item } | { table: 'stock_events'; row: StockEvent }

export interface StockSnapshot {
  items: Item[]
  events: StockEvent[]
}

/** A failure loading stock (for example, offline). */
export class StockError extends Error {}

/**
 * What the stock screens need from the backend, beyond writes (which go through
 * the outbox). Tests pass an in-memory fake.
 */
export interface StockApi {
  /** Every item and stock event in the household. Throws StockError when it can't. */
  load(householdId: string): Promise<StockSnapshot>
  /** Calls onChange with each item or event added or changed in the household. */
  subscribe(householdId: string, onChange: (change: RemoteChange) => void): () => void
}

/** One timestamp format everywhere: compareEvents sorts timestamps as strings. */
const iso = (t: string) => new Date(t).toISOString()
const num = (v: unknown) => (v == null ? null : Number(v))

/** Rows from Postgres (numeric may come as a string, timestamps as "…+00:00") into app shape. */
export function toItem(row: Record<string, unknown>): Item {
  const r = row as unknown as Item
  return {
    ...r,
    aliases: r.aliases ?? [],
    shelf_life_days: num(r.shelf_life_days),
    low_threshold: num(r.low_threshold),
    piece_weight_g: num(r.piece_weight_g),
    opened_shelf_life_days: num(r.opened_shelf_life_days),
    step: Number(r.step),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

export function toEvent(row: Record<string, unknown>): StockEvent {
  const r = row as unknown as StockEvent
  return {
    ...r,
    quantity: Number(r.quantity),
    occurred_at: iso(r.occurred_at),
    created_at: iso(r.created_at),
  }
}

export function supabaseStockApi(sb: Supabase): StockApi {
  const all = (table: StockTable, householdId: string) => readAll(sb, table, householdId, (e) => new StockError(e.message))

  return {
    async load(householdId) {
      try {
        const [items, events] = await Promise.all([all('items', householdId), all('stock_events', householdId)])
        return { items: items.map(toItem), events: events.map(toEvent) }
      } catch (e) {
        throw e instanceof StockError ? e : new StockError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb
        .channel(`stock:${householdId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter }, (p) =>
          onChange({ table: 'items', row: toItem(p.new) }),
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter }, (p) =>
          onChange({ table: 'items', row: toItem(p.new) }),
        )
        // Events are never updated or deleted, so inserts are all there is.
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_events', filter }, (p) =>
          onChange({ table: 'stock_events', row: toEvent(p.new) }),
        )
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
