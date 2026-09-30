import type { PostgrestError } from '@supabase/supabase-js'
import type { Supabase } from '../lib/supabase.ts'
import type { OutboxOp } from './db.ts'
import type { Executor, OpResult } from './outbox.ts'

/** Network trouble and server-side hiccups are worth retrying; anything else the server meant. */
export function classify(error: Pick<PostgrestError, 'code' | 'message'> | null, status?: number): OpResult {
  if (!error) return { status: 'ok' }
  const msg = error.message.toLowerCase()
  const network = !error.code && (msg.includes('fetch') || msg.includes('network') || msg.includes('load failed'))
  if (network || (status !== undefined && (status >= 500 || status === 0 || status === 408 || status === 429))) {
    return { status: 'retry' }
  }
  // An expired session comes back as 401 and gets refreshed on the next try.
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return { status: 'retry' }
  return { status: 'reject', message: error.message }
}

/** Replays queued ops against Supabase. The tables' RLS decides what is allowed. */
export function supabaseExecutor(sb: Supabase): Executor {
  // Tables arrive batch by batch, so ops name their table as a string.
  const from = (table: string) => sb.from(table as never) as unknown as ReturnType<Supabase['from']>

  return async (op: OutboxOp) => {
    if (op.kind === 'update') {
      let q = from(op.table).update(op.patch as never)
      for (const [col, val] of Object.entries(op.match)) q = q.eq(col as never, val as never)
      const { error, status } = await q
      return classify(error, status)
    }
    if (op.kind === 'delete') {
      // Deleting what's already gone deletes nothing, so a replay is harmless too.
      let q = from(op.table).delete()
      for (const [col, val] of Object.entries(op.match)) q = q.eq(col as never, val as never)
      const { error, status } = await q
      return classify(error, status)
    }
    // Same id twice is ignored, so a replay after a lost response is harmless.
    const { error, status } = await from(op.table).upsert(op.row as never, { onConflict: 'id', ignoreDuplicates: true })
    return classify(error, status)
  }
}
