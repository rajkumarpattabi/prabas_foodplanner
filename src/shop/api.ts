import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { ShoppingItem } from './types.ts'

/** A failure loading the shopping list (for example, offline). */
export class ShoppingError extends Error {}

export interface ShoppingApi {
  /** Every stored shopping line in the household. Throws ShoppingError when it can't. */
  load(householdId: string): Promise<ShoppingItem[]>
  /** Calls onChange with each line added, changed or removed. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString())

export function toShoppingItem(row: Record<string, unknown>): ShoppingItem {
  const r = row as unknown as ShoppingItem
  return {
    ...r,
    quantity: r.quantity === null ? null : Number(r.quantity),
    done_at: iso(r.done_at),
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
  }
}

export function supabaseShoppingApi(sb: Supabase): ShoppingApi {
  return {
    async load(householdId) {
      try {
        return (await readAll(sb, 'shopping_items', householdId, (e) => new ShoppingError(e.message))).map(toShoppingItem)
      } catch (e) {
        throw e instanceof ShoppingError ? e : new ShoppingError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`shopping:${householdId}`)
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table: 'shopping_items', filter }, (p) =>
          onChange({ table: 'shopping_items', row: toShoppingItem(p.new) }),
        )
      }
      // Deletes can't be filtered and carry only the id: one from another household matches nothing here.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'shopping_items' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) onChange({ table: 'shopping_items', deletedId: id })
      })
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
