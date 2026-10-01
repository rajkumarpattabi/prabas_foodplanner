// The usual ferment time, learned from recent batches: faster in hot weather, slower in
// cool, and it follows whatever this kitchen does.

import type { BatchState } from './batchState.ts'
import { adjustableStage } from './plan.ts'
import type { PrepStage } from './types.ts'

/** How many recent batches count. */
export const LEARN_FROM = 5

const HOUR = 3_600_000

/**
 * The middle value of how long the adjustable stage really took (with any "ready early"
 * or "needs longer") in the last few finished batches, to the nearest half hour.
 * The plan's own time until there's a batch to learn from.
 */
export function usualHours(planStages: readonly PrepStage[], past: readonly BatchState[]): number | null {
  const i = adjustableStage(planStages)
  if (i < 0) return null
  const finished = past
    .filter((s) => (s.phase === 'ready' || s.phase === 'used_up' || s.phase === 'expired') && s.times[i] && s.batch.stages[i]?.key === planStages[i].key)
    .sort((a, b) => b.batch.created_at.localeCompare(a.batch.created_at))
    .slice(0, LEARN_FROM)
    .map((s) => (s.times[i].end.getTime() - s.times[i].start.getTime()) / HOUR)
    .sort((a, b) => a - b)
  if (finished.length === 0) return planStages[i].hours
  const mid = finished.length / 2
  const median = finished.length % 2 ? finished[Math.floor(mid)] : (finished[mid - 1] + finished[mid]) / 2
  return Math.round(median * 2) / 2
}
