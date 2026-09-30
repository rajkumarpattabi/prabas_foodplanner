import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { Dish, Ingredient } from './types.ts'

/** A failure loading dishes (for example, offline). */
export class DishError extends Error {}

/** What the dish screens need from the backend, beyond writes (which go through the outbox). */
export interface DishApi {
  /** Every dish in the household. Throws DishError when it can't. */
  load(householdId: string): Promise<Dish[]>
  /** Calls onChange with each dish added, changed or deleted in the household. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string) => new Date(t).toISOString()

/** A row from Postgres into app shape: one timestamp format, numbers as numbers. */
export function toDish(row: Record<string, unknown>): Dish {
  const r = row as unknown as Dish
  return {
    ...r,
    aliases: r.aliases ?? [],
    meals: r.meals ?? [],
    tags: r.tags ?? [],
    side_ids: r.side_ids ?? [],
    ingredients: (r.ingredients ?? []).map((i: Ingredient) => ({ ...i, quantity: Number(i.quantity) })),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  }
}

export function supabaseDishApi(sb: Supabase): DishApi {
  return {
    async load(householdId) {
      try {
        return (await readAll(sb, 'dishes', householdId, (e) => new DishError(e.message))).map(toDish)
      } catch (e) {
        throw e instanceof DishError ? e : new DishError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb
        .channel(`dishes:${householdId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dishes', filter }, (p) =>
          onChange({ table: 'dishes', row: toDish(p.new) }),
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dishes', filter }, (p) =>
          onChange({ table: 'dishes', row: toDish(p.new) }),
        )
        // Supabase can't filter deletes, and they carry only the id. An id from another
        // household matches nothing here, so it's harmless.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dishes' }, (p) => {
          const id = (p.old as { id?: string }).id
          if (id) onChange({ table: 'dishes', deletedId: id })
        })
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
