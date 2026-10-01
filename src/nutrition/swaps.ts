// Swap ideas within familiar meals: adai for plain dosa when protein is short, ragi kali
// for plain rice when millets are, or sundal as an extra side. Kids' favourites first.

import type { Dish, Meal } from '../dishes/types.ts'
import type { Item } from '../stock/types.ts'
import { isMainFor, type Combo } from '../plan/combos.ts'
import type { DishHistory } from '../plan/history.ts'
import { GROUP_WEIGHT, type Gap, type Nutrition } from './balance.ts'
import { cover, GROUP_WORDS, type Group } from './groups.ts'

export interface SwapIdea {
  kind: 'main' | 'side'
  dish: Dish
  group: Group
  /** The combo to switch to. */
  combo: Combo
}

/** Sides worth adding for protein: kootu, sundal and the like. */
const SIDE_FOR_PROTEIN = new Set<Dish['type']>(['kootu', 'snack', 'poriyal'])

const toCook = (c: Combo) => [c.main, ...(c.base ? [c.base] : []), ...c.sides]

/** Does it fill this gap? Variety needs a vegetable not had in the fortnight. */
export function fills(dishes: readonly Dish[], gap: Gap, n: Pick<Nutrition, 'recentVegetables'>, itemsById: ReadonlyMap<string, Pick<Item, 'category'>>): boolean {
  const c = cover(dishes, itemsById)
  return gap.group === 'variety' ? [...c.vegetables].some((v) => !n.recentVegetables.has(v)) : c.groups.has(gap.group)
}

export interface SwapInput {
  combo: Combo
  meal: Meal
  nutrition: Nutrition
  dishes: readonly Dish[]
  history: ReadonlyMap<string, DishHistory>
  itemsById: ReadonlyMap<string, Pick<Item, 'category'>>
  /** A veg-only day: nothing non-veg offered. */
  vegOnly: boolean
}

/** Kids' favourites, then favourites, then the most often cooked, then by name. */
function familiarFirst(history: ReadonlyMap<string, DishHistory>) {
  return (a: Dish, b: Dish) =>
    Number(b.is_kids_favourite) - Number(a.is_kids_favourite) ||
    Number(b.is_favourite) - Number(a.is_favourite) ||
    (history.get(b.id)?.timesCooked ?? 0) - (history.get(a.id)?.timesCooked ?? 0) ||
    a.name_en.localeCompare(b.name_en)
}

/**
 * One idea for a combo that fills none of the gaps, for the biggest gap a familiar
 * dish can fill: a main of the same type first, else an extra side for protein.
 */
export function swapIdea({ combo, meal, nutrition, dishes, history, itemsById, vegOnly }: SwapInput): SwapIdea | null {
  const gaps = [...nutrition.gaps].sort((a, b) => b.size * GROUP_WEIGHT[b.group] - a.size * GROUP_WEIGHT[a.group])
  if (!gaps.length || gaps.some((g) => fills(toCook(combo), g, nutrition, itemsById))) return null
  const familiar = (d: Dish) => (history.get(d.id)?.timesCooked ?? 0) > 0 || d.is_favourite || d.is_kids_favourite
  const allowed = (d: Dish) => !d.dont_suggest && (!vegOnly || d.is_veg)

  for (const gap of gaps) {
    const mains = dishes
      .filter((d) => d.id !== combo.main.id && d.type === combo.main.type && isMainFor(d, meal) && allowed(d) && familiar(d))
      .filter((d) => fills([d], gap, nutrition, itemsById))
      .sort(familiarFirst(history))
    if (mains[0]) return { kind: 'main', dish: mains[0], group: gap.group, combo: { ...combo, main: mains[0] } }
    if (gap.group === 'legume' || gap.group === 'protein') {
      const taken = new Set(toCook(combo).map((d) => d.id))
      const sides = dishes
        .filter((d) => !taken.has(d.id) && SIDE_FOR_PROTEIN.has(d.type) && d.meals.includes(meal) && allowed(d))
        .filter((d) => fills([d], gap, nutrition, itemsById))
        .sort(familiarFirst(history))
      if (sides[0]) return { kind: 'side', dish: sides[0], group: gap.group, combo: { ...combo, sides: [...combo.sides, sides[0]] } }
    }
  }
  return null
}

/** "More protein: try Adai", "Add Chana sundal for protein". */
export function swapText(idea: SwapIdea, name: (d: Dish) => string): string {
  const word = GROUP_WORDS[idea.group]
  return idea.kind === 'main' ? `More ${word}: try ${name(idea.dish)}` : `Add ${name(idea.dish)} for ${word}`
}
