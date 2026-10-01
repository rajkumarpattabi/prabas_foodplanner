// What's ready to use now, per prepared item, for suggestions and cooking.

import { daysBetween, localDate } from '../lib/dates.ts'
import type { Level } from '../stock/urgency.ts'
import { ageDays, batchState, type BatchState } from './batchState.ts'
import type { Batch, BatchEvent, BatchUnit } from './types.ts'

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

export interface ReadyBatchRow {
  state: BatchState
  /** Red: use today, or past its time. Amber: by tomorrow. Green: later. */
  level: Level
  label: string
}

/** Batches ready to use, or past their time with some left, soonest to spoil first. */
export function readyBatchRows(batches: readonly Batch[], events: readonly BatchEvent[], now: Date): ReadyBatchRow[] {
  return batches
    .map((b) => batchState(b, events, now))
    .filter((s) => s.phase === 'ready' || s.phase === 'expired')
    .map((state) => {
      const d = daysBetween(localDate(now), localDate(state.expiresAt))
      const [level, label]: [Level, string] =
        state.phase === 'expired' ? ['red', 'Past its time · check'] : d <= 0 ? ['red', 'Use today'] : d === 1 ? ['amber', 'Use by tomorrow'] : ['green', `Keeps ${d} days`]
      return { state, level, label }
    })
    .sort((a, b) => a.state.expiresAt.getTime() - b.state.expiresAt.getTime())
}
