import { createContext, useContext } from 'react'
import type { Item, StockEvent } from './types.ts'

export type StockStatus = 'loading' | 'error' | 'ready'

/** A new item: names, category and unit, plus anything that shouldn't take its default. */
export type NewItem = Pick<Item, 'name_ta' | 'name_en' | 'category' | 'unit'> &
  Partial<Omit<Item, 'id' | 'household_id' | 'created_by' | 'created_at' | 'updated_by' | 'updated_at'>>

/** Everything about an item that can change after it's made (not its stored unit). */
export type ItemPatch = Partial<
  Pick<
    Item,
    | 'name_ta'
    | 'name_en'
    | 'aliases'
    | 'category'
    | 'display_unit'
    | 'shelf_life_days'
    | 'is_staple'
    | 'low_threshold'
    | 'piece_weight_g'
    | 'has_opened_form'
    | 'opened_shelf_life_days'
    | 'step'
    | 'archived'
  >
>

/** A new stock event: what happened, plus any detail beyond the defaults (whole, now). */
export type NewStockEvent = Pick<StockEvent, 'item_id' | 'kind' | 'quantity'> &
  Partial<Pick<StockEvent, 'reason' | 'batch_id' | 'expires_on' | 'form' | 'note' | 'occurred_at'>>

export interface StockState {
  status: StockStatus
  /** Why the first load failed (status "error"). */
  error: string | null
  /** Every item, archived ones included. */
  items: Item[]
  /** Each item's events, in no particular order (computeStock sorts them). */
  eventsByItem: ReadonlyMap<string, StockEvent[]>
  /** These apply at once, and are saved through the outbox (retried until they get through). */
  addItem: (item: NewItem) => Item
  updateItem: (id: string, patch: ItemPatch) => void
  record: (events: NewStockEvent[]) => StockEvent[]
  /** Read everything again from the server (after a restore, for example). */
  reload: () => Promise<void>
}

export const StockContext = createContext<StockState | null>(null)

export function useStock(): StockState {
  const ctx = useContext(StockContext)
  if (!ctx) throw new Error('useStock must be used inside StockProvider')
  return ctx
}
