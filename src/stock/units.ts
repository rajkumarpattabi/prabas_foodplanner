// Unit conversion and display. Quantities are stored in each item's base unit
// (g, ml, or a count); people enter and read natural units ("1.5 kg", "6 pieces").

import type { BaseUnit, EntryUnit, Item } from './types.ts'

type UnitItem = Pick<Item, 'unit' | 'piece_weight_g'>

/** The units someone can enter for an item. */
export function entryUnits(item: UnitItem): EntryUnit[] {
  switch (item.unit) {
    case 'g':
      return item.piece_weight_g ? ['kg', 'g', 'piece'] : ['kg', 'g']
    case 'ml':
      return ['l', 'ml']
    case 'piece':
      return item.piece_weight_g ? ['piece', 'kg', 'g'] : ['piece']
    default:
      return [item.unit]
  }
}

/**
 * Converts an entered amount to the item's base unit. Returns null when the units
 * can't be converted (for example grams of an item counted in pieces, with no piece weight).
 */
export function toBase(amount: number, from: EntryUnit, item: UnitItem): number | null {
  if (!Number.isFinite(amount)) return null
  const grams = (): number | null => {
    if (from === 'g') return amount
    if (from === 'kg') return amount * 1000
    if ((from === 'piece' || from === 'bunch') && item.piece_weight_g) return amount * item.piece_weight_g
    return null
  }
  switch (item.unit) {
    case 'g': {
      const g = grams()
      return g === null ? null : round(g)
    }
    case 'ml':
      return from === 'ml' ? amount : from === 'l' ? round(amount * 1000) : null
    case 'piece':
    case 'bunch':
      if (from === item.unit) return amount
      if ((from === 'g' || from === 'kg') && item.piece_weight_g) return round(grams()! / item.piece_weight_g, 2)
      return null
    case 'packet':
      return from === 'packet' ? amount : null
  }
}

/** Converts a base-unit amount to an entry unit, for pre-filling forms. */
export function fromBase(amount: number, to: EntryUnit, item: UnitItem): number | null {
  const one = toBase(1, to, item)
  return one ? round(amount / one, 3) : null
}

const plural: Record<BaseUnit, [string, string]> = {
  g: ['g', 'g'],
  ml: ['ml', 'ml'],
  piece: ['piece', 'pieces'],
  bunch: ['bunch', 'bunches'],
  packet: ['packet', 'packets'],
}

/** "750 g", "1.5 kg", "2 l", "1 piece", "6 pieces", "0.5 bunches". */
export function formatQuantity(amount: number, item: UnitItem): string {
  const n = Math.max(0, amount)
  if (item.unit === 'g' && n >= 1000) return `${trim(n / 1000)} kg`
  if (item.unit === 'ml' && n >= 1000) return `${trim(n / 1000)} l`
  const [one, many] = plural[item.unit]
  return `${trim(n)} ${n === 1 ? one : many}`
}

function trim(n: number): string {
  return String(round(n, n >= 10 ? 1 : 2))
}

function round(n: number, places = 0): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** The usual +/− step for a unit, when an item has none of its own. */
export function defaultStep(unit: BaseUnit): number {
  return unit === 'g' || unit === 'ml' ? 250 : 1
}
