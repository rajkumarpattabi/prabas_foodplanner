// Labels and styles shared by the stock forms.

import type { Category, EntryUnit } from './types.ts'

export const CATEGORY_LABELS: Record<Category, string> = {
  vegetable: 'Vegetable',
  greens: 'Greens',
  fruit: 'Fruit',
  meat: 'Meat',
  fish: 'Fish',
  egg: 'Eggs',
  dairy: 'Dairy',
  grain: 'Grains and rice',
  dal: 'Dals',
  spice: 'Spices',
  oil: 'Oils',
  other: 'Other',
}

export const ENTRY_UNIT_LABELS: Record<EntryUnit, string> = {
  kg: 'kg',
  g: 'g',
  l: 'l',
  ml: 'ml',
  piece: 'pieces',
  bunch: 'bunches',
  packet: 'packets',
}

export const inputClass = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3'
export const primaryClass = 'min-h-12 w-full rounded-xl bg-leaf font-semibold text-bg disabled:opacity-50'
