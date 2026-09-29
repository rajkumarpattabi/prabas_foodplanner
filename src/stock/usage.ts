// "Days left" for staples, learned from how fast the household uses them.

import type { Usage } from './computeStock.ts'

export const USAGE = {
  /** How far back to look. */
  windowDays: 28,
  /** Need at least this much history before trusting the rate. */
  minHistoryDays: 7,
  /** Take this share off, for use nobody logged (a pinch of this, a handful of that). */
  untrackedBuffer: 0.2,
} as const

const DAY_MS = 86_400_000

/**
 * Days until a staple runs out at the recent rate of use, or null when there isn't
 * enough history (the app then falls back to the item's low threshold).
 *
 * @param firstEventAt when this item's history starts (its oldest event)
 */
export function daysLeft(total: number, usage: readonly Usage[], firstEventAt: string | null, now = new Date()): number | null {
  if (!firstEventAt) return null
  const windowStart = now.getTime() - USAGE.windowDays * DAY_MS
  const historyStart = Math.max(windowStart, new Date(firstEventAt).getTime())
  const historyDays = (now.getTime() - historyStart) / DAY_MS
  if (historyDays < USAGE.minHistoryDays) return null

  const used = usage.filter((u) => new Date(u.at).getTime() >= historyStart).reduce((s, u) => s + u.amount, 0)
  if (used <= 0) return null

  const perDay = used / historyDays
  return Math.max(0, (total / perDay) * (1 - USAGE.untrackedBuffer))
}
