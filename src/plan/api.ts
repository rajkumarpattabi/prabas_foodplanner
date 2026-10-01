import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { Leftover, MealRecord } from './types.ts'

/** A failure loading meals (for example, offline). */
export class MealError extends Error {}

export interface MealApi {
  /** Every meal and leftover in the household. Throws MealError when it can't. */
  load(householdId: string): Promise<{ meals: MealRecord[]; leftovers: Leftover[] }>
  /** Calls onChange with each meal or leftover added, changed or deleted. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString())

export function toMeal(row: Record<string, unknown>): MealRecord {
  const r = row as unknown as MealRecord
  return {
    ...r,
    dish_ids: r.dish_ids ?? [],
    dish_names: r.dish_names ?? [],
    cooked_at: iso(r.cooked_at),
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
  }
}

export function toLeftover(row: Record<string, unknown>): Leftover {
  const r = row as unknown as Leftover
  return {
    ...r,
    servings: Number(r.servings),
    eaten_at: iso(r.eaten_at),
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
  }
}

export function supabaseMealApi(sb: Supabase): MealApi {
  return {
    async load(householdId) {
      try {
        const err = (e: { message: string }) => new MealError(e.message)
        const [meals, leftovers] = await Promise.all([readAll(sb, 'meals', householdId, err), readAll(sb, 'leftovers', householdId, err)])
        return { meals: meals.map(toMeal), leftovers: leftovers.map(toLeftover) }
      } catch (e) {
        throw e instanceof MealError ? e : new MealError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`meals:${householdId}`)
      for (const [table, shape] of [
        ['meals', toMeal],
        ['leftovers', toLeftover],
      ] as const) {
        for (const event of ['INSERT', 'UPDATE'] as const) {
          channel.on('postgres_changes', { event, schema: 'public', table, filter }, (p) => onChange({ table, row: shape(p.new) }))
        }
        // Deletes can't be filtered and carry only the id: one from another household matches nothing here.
        channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
          const id = (p.old as { id?: string }).id
          if (id) onChange({ table, deletedId: id })
        })
      }
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
