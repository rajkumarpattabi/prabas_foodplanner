import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { Batch, BatchEvent } from './types.ts'

/** A failure loading batches (for example, offline). */
export class BatchError extends Error {}

export interface BatchApi {
  /** Every batch and batch event in the household. Throws BatchError when it can't. */
  load(householdId: string): Promise<{ batches: Batch[]; batch_events: BatchEvent[] }>
  /** Calls onChange with each batch or event added, and each batch removed. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString())
const num = (n: unknown) => (n === null || n === undefined ? null : Number(n))

export function toBatch(row: Record<string, unknown>): Batch {
  const r = row as unknown as Batch
  return {
    ...r,
    stages: r.stages ?? [],
    yield: Number(r.yield),
    keeps_days: Number(r.keeps_days),
    planned_start: iso(r.planned_start)!,
    ready_by: iso(r.ready_by),
    created_at: iso(r.created_at)!,
  }
}

export function toBatchEvent(row: Record<string, unknown>): BatchEvent {
  const r = row as unknown as BatchEvent
  return { ...r, stage: num(r.stage), quantity: num(r.quantity), occurred_at: iso(r.occurred_at)!, created_at: iso(r.created_at)! }
}

export function supabaseBatchApi(sb: Supabase): BatchApi {
  return {
    async load(householdId) {
      try {
        const err = (e: { message: string }) => new BatchError(e.message)
        const [batches, events] = await Promise.all([readAll(sb, 'batches', householdId, err), readAll(sb, 'batch_events', householdId, err)])
        return { batches: batches.map(toBatch), batch_events: events.map(toBatchEvent) }
      } catch (e) {
        throw e instanceof BatchError ? e : new BatchError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`batches:${householdId}`)
      // Neither is ever updated: a batch is started or removed, and events are only added.
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'batches', filter }, (p) =>
        onChange({ table: 'batches', row: toBatch(p.new) }),
      )
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'batch_events', filter }, (p) =>
        onChange({ table: 'batch_events', row: toBatchEvent(p.new) }),
      )
      // Deletes can't be filtered and carry only the id: one from another household matches nothing here.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'batches' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) onChange({ table: 'batches', deletedId: id })
      })
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
