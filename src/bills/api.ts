import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { Bill, BillAliasRow } from './types.ts'

/** A failure loading bills (for example, offline). */
export class BillError extends Error {}

export interface BillApi {
  /** Every bill and bill name in the household. Throws BillError when it can't. */
  load(householdId: string): Promise<{ bills: Bill[]; bill_aliases: BillAliasRow[] }>
  /** Calls onChange with each bill or bill name added, changed or removed. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string) => new Date(t).toISOString()

export const toBill = (row: Record<string, unknown>): Bill => {
  const r = row as unknown as Bill
  return { ...r, total: r.total === null ? null : Number(r.total), lines: Number(r.lines), created_at: iso(r.created_at) }
}
export const toBillAlias = (row: Record<string, unknown>): BillAliasRow => {
  const r = row as unknown as BillAliasRow
  return { ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) }
}

export function supabaseBillApi(sb: Supabase): BillApi {
  return {
    async load(householdId) {
      try {
        const err = (e: { message: string }) => new BillError(e.message)
        const [bills, aliases] = await Promise.all([readAll(sb, 'bills', householdId, err), readAll(sb, 'bill_aliases', householdId, err)])
        return { bills: bills.map(toBill), bill_aliases: aliases.map(toBillAlias) }
      } catch (e) {
        throw e instanceof BillError ? e : new BillError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`bills:${householdId}`)
      for (const [table, shape] of [
        ['bills', toBill],
        ['bill_aliases', toBillAlias],
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
