// How much to pre-fill when ticking something off: what's usually bought.

import type { Item, StockEvent } from '../stock/types.ts'

/**
 * The amount bought last time (or one step, if never bought here), rounded up in
 * steps to cover what's short, in the item's stored unit.
 */
export function usualAmount(item: Pick<Item, 'step'>, events: readonly StockEvent[], short: number | null): number {
  const last = [...events]
    .filter((e) => e.kind === 'delta' && e.quantity > 0 && !e.batch_id && (e.reason === 'bought' || e.reason === null))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  const usual = last?.quantity ?? item.step
  if (short === null || short <= usual) return usual
  return Math.ceil(short / item.step - 1e-9) * item.step
}
