// "Brinjal 40": no quantity, just a price. Work it out from what's usually paid.

import type { Item } from '../stock/types.ts'

/** How many past priced purchases count. */
export const PRICE_HISTORY = 5

export interface PricedPurchase {
  /** In the item's stored unit. */
  quantity: number
  /** Rupees paid for that quantity. */
  price: number | null
  occurred_at: string
}

/** Rupees per stored unit (per g, per ml, per piece): the middle of the last few priced purchases. */
export function pricePerUnit(purchases: readonly PricedPurchase[]): number | null {
  const per = [...purchases]
    .filter((p) => p.price !== null && p.price > 0 && p.quantity > 0)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, PRICE_HISTORY)
    .map((p) => p.price! / p.quantity)
    .sort((a, b) => a - b)
  if (!per.length) return null
  const mid = per.length / 2
  return per.length % 2 ? per[Math.floor(mid)] : (per[mid - 1] + per[mid]) / 2
}

/** The quantity a price buys, in steps of the item's usual amount (at least one step). */
export function quantityFromPrice(price: number, perUnit: number, item: Pick<Item, 'step'>): number {
  const steps = Math.max(1, Math.round(price / perUnit / item.step))
  return steps * item.step
}

/** "₹50/kg", "₹8/piece": for "Estimated from …". */
export function perUnitText(perUnit: number, item: Pick<Item, 'unit'>): string {
  const rupees = (n: number) => `₹${Math.round(n)}`
  switch (item.unit) {
    case 'g':
      return `${rupees(perUnit * 1000)}/kg`
    case 'ml':
      return `${rupees(perUnit * 1000)}/l`
    default:
      return `${rupees(perUnit)}/${item.unit}`
  }
}
