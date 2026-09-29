// Which section of the Stock screen an item goes in, and its coloured, labelled chip.
// Urgency order used everywhere: red = use today, amber = soon or check, green = fine.

import { daysBetween, localDate } from '../lib/dates.ts'
import type { Stock } from './computeStock.ts'
import type { Item } from './types.ts'

export const URGENCY = {
  /** Amber when a batch expires within this many days. */
  soonDays: 2,
  /** Staples alert at this many days left. */
  stapleAlertDays: 3,
} as const

export type Group = 'use_soon' | 'running_low' | 'fine'
export type Level = 'red' | 'amber' | 'green'

export interface Urgency {
  group: Group
  level: Level
  /** Short text shown with the colour (never colour alone). */
  label: string
  /** For sorting within a group: lower is more urgent. */
  rank: number
}

type UrgencyItem = Pick<Item, 'is_staple' | 'low_threshold'>

export function urgencyOf(item: UrgencyItem, stock: Stock, daysLeft: number | null, now = new Date()): Urgency {
  const today = localDate(now)

  // Use soon: the batch expiring first, if it expires within a couple of days.
  const soonest = stock.batches.find((b) => b.expiresOn !== null)
  if (soonest?.expiresOn) {
    const d = daysBetween(today, soonest.expiresOn)
    if (d <= 0) return { group: 'use_soon', level: 'red', label: d < 0 ? 'Past its date · check' : 'Use today', rank: d }
    if (d <= URGENCY.soonDays) return { group: 'use_soon', level: 'amber', label: d === 1 ? 'Use by tomorrow' : `Use in ${d} days`, rank: d }
  }

  // Running low: out, below its threshold, or a staple with only a few days left.
  if (item.is_staple && stock.total <= 0) return { group: 'running_low', level: 'red', label: 'Out', rank: -1 }
  if (item.is_staple && daysLeft !== null && daysLeft <= URGENCY.stapleAlertDays) {
    const days = Math.max(0, Math.round(daysLeft))
    return { group: 'running_low', level: 'amber', label: days <= 0 ? 'Runs out today' : `About ${days} day${days === 1 ? '' : 's'} left`, rank: daysLeft }
  }
  if (item.low_threshold !== null && stock.total <= item.low_threshold && (item.is_staple || stock.total > 0)) {
    return { group: 'running_low', level: 'amber', label: 'Running low', rank: 10 }
  }

  if (soonest?.expiresOn) {
    const d = daysBetween(today, soonest.expiresOn)
    return { group: 'fine', level: 'green', label: `Fresh · ${d} days`, rank: d }
  }
  return { group: 'fine', level: 'green', label: 'In stock', rank: 1000 }
}

/** Items that belong on the Stock screen: anything in stock, and staples even when out. */
export function isShown(item: Pick<Item, 'is_staple' | 'archived'>, stock: Stock): boolean {
  return !item.archived && (stock.total > 0 || item.is_staple)
}
