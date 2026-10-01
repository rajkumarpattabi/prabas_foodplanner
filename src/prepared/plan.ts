// Prep plans: what each stage is called, and reading a dish's stored plan safely.

import type { Dish } from '../dishes/types.ts'
import { STAGE_KEYS, type BatchUnit, type PrepPlan, type PrepStage, type PreparedUse, type StageKey } from './types.ts'

/** "Soak" (to do), "Soaked" (done it), "soaking" (while it runs). */
export const STAGE_LABELS: Readonly<Record<StageKey, { verb: string; done: string; doing: string }>> = {
  soak: { verb: 'Soak', done: 'Soaked', doing: 'soaking' },
  grind: { verb: 'Grind', done: 'Ground', doing: 'grinding' },
  cook: { verb: 'Cook', done: 'Cooked', doing: 'cooling' },
  ferment: { verb: 'Ferment', done: 'Fermented', doing: 'fermenting' },
  knead: { verb: 'Knead', done: 'Kneaded', doing: 'resting' },
  rest: { verb: 'Rest', done: 'Rested', doing: 'resting' },
  roast: { verb: 'Roast and grind', done: 'Done', doing: 'cooling' },
}

/** "1 meal", "6 glasses". */
export function amount(n: number, unit: BatchUnit): string {
  const one = unit === 'meals' ? 'meal' : 'glass'
  const many = unit === 'meals' ? 'meals' : 'glasses'
  return `${n} ${n === 1 ? one : many}`
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseStage(v: unknown): PrepStage | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>
  if (!STAGE_KEYS.includes(s.key as StageKey) || !isNum(s.hours) || s.hours < 0 || typeof s.action !== 'boolean') return null
  return {
    key: s.key as StageKey,
    hours: s.hours,
    action: s.action,
    ...(s.takes_ingredients === true ? { takes_ingredients: true } : {}),
    ...(s.adjustable === true ? { adjustable: true } : {}),
  }
}

/**
 * The dish's prep plan, or null if it has none or it doesn't make sense. A plan starts
 * with something to do, and exactly one stage takes the ingredients.
 */
export function prepPlan(dish: Pick<Dish, 'prep_plan'>): PrepPlan | null {
  const p = dish.prep_plan as Record<string, unknown> | null
  if (!p || typeof p !== 'object' || !Array.isArray(p.stages)) return null
  const stages = p.stages.map(parseStage)
  if (stages.length === 0 || stages.some((s) => s === null)) return null
  const ok = stages as PrepStage[]
  if (!ok[0].action || ok.filter((s) => s.takes_ingredients).length !== 1) return null
  if (!isNum(p.yield) || p.yield <= 0 || (p.unit !== 'meals' && p.unit !== 'glasses') || !isNum(p.keeps_days)) return null
  const ingredients = Array.isArray(p.ingredients)
    ? p.ingredients.filter((i): i is PrepPlan['ingredients'][number] => !!i && typeof i.item_id === 'string' && isNum(i.quantity))
    : []
  return { stages: ok, yield: p.yield, unit: p.unit, keeps_days: p.keeps_days, ingredients, keep_going: p.keep_going === true }
}

/** The prepared items a dish uses, read safely. */
export function preparedUses(dish: Pick<Dish, 'uses_prepared'>): PreparedUse[] {
  const list = dish.uses_prepared
  if (!Array.isArray(list)) return []
  return list.filter((u): u is PreparedUse => !!u && typeof u.dish_id === 'string' && isNum(u.quantity) && u.quantity > 0)
}

/** The stage whose time can be changed per batch (ferment), if any. */
export const adjustableStage = (stages: readonly PrepStage[]) => stages.findIndex((s) => s.adjustable)

export const totalHours = (stages: readonly PrepStage[]) => stages.reduce((h, s) => h + s.hours, 0)
