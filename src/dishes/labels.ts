// Words for dish types, meals and tags, as shown in the app.

import type { DishTag, DishType, Meal } from './types.ts'

export const TYPE_LABELS: Record<DishType, string> = {
  tiffin: 'Tiffin',
  variety_rice: 'Rice',
  kuzhambu: 'Kuzhambu',
  sambar: 'Sambar',
  rasam: 'Rasam',
  poriyal: 'Poriyal',
  kootu: 'Kootu and gravy',
  chutney: 'Chutney',
  nonveg_gravy: 'Non-veg gravy',
  nonveg_fry: 'Non-veg fry',
  drink: 'Drink',
  snack: 'Snack and sweet',
}

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
}

export const TAG_LABELS: Record<DishTag, string> = {
  protein: 'Protein',
  fibre: 'Fibre',
  greens: 'Greens',
  millet: 'Millet',
  fish: 'Fish',
  legume: 'Legume',
  curd: 'Curd',
}
