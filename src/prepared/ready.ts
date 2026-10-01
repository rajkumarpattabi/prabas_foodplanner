// What's ready to use now, per prepared item, for suggestions and cooking.

import { ageDays, type BatchState } from './batchState.ts'
import type { BatchUnit } from './types.ts'

export interface ReadyPrepared {
  dish_id: string
  /** Across all its ready batches. */
  remaining: number
  unit: BatchUnit
  /** Days since the oldest ready batch was ready: older batter suits uthappam. */
  ageDays: number
  /** Oldest first: used up in that order. */
  batches: BatchState[]
}

export function readyPrepared(states: readonly BatchState[], now: Date): Map<string, ReadyPrepared> {
  const out = new Map<string, ReadyPrepared>()
  const ready = states.filter((s) => s.phase === 'ready' && s.batch.dish_id).sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime())
  for (const s of ready) {
    const id = s.batch.dish_id!
    const r = out.get(id)
    if (r) {
      r.remaining += s.remaining
      r.batches.push(s)
    } else {
      out.set(id, { dish_id: id, remaining: s.remaining, unit: s.unit, ageDays: ageDays(s, now), batches: [s] })
    }
  }
  return out
}

/** Take `quantity` from the oldest batches first; never more than they have. */
export function takeFromBatches(ready: ReadyPrepared | undefined, quantity: number): { batch_id: string; quantity: number }[] {
  const out: { batch_id: string; quantity: number }[] = []
  let left = quantity
  for (const s of ready?.batches ?? []) {
    if (left <= 0) break
    const take = Math.min(left, s.remaining)
    if (take > 0) out.push({ batch_id: s.batch.id, quantity: take })
    left -= take
  }
  return out
}
