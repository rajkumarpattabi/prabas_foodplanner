// Prepared items and their batches (see supabase/migrations/0011_prepared.sql).
// A prepared item is a dish with a prep plan: batter, koozh, dough, paste, podi.

import type { Ingredient } from '../dishes/types.ts'

export const STAGE_KEYS = ['soak', 'grind', 'cook', 'ferment', 'knead', 'rest', 'roast'] as const
export type StageKey = (typeof STAGE_KEYS)[number]

export type BatchUnit = 'meals' | 'glasses'

/** One step of making it. */
export interface PrepStage {
  key: StageKey
  /** How long until the next stage can start (or until it's ready, for the last). */
  hours: number
  /** Someone has to do it (soak, grind, cook). Waiting stages (ferment, rest) run by the clock. */
  action: boolean
  /** Doing this stage takes the plan's ingredients from stock. Exactly one stage does. */
  takes_ingredients?: boolean
  /** Its time can be changed per batch, and the app learns the usual (ferment). */
  adjustable?: boolean
}

/** Stored on the dish, in `prep_plan`. */
export interface PrepPlan {
  stages: PrepStage[]
  /** What one batch makes. */
  yield: number
  unit: BatchUnit
  /** Days it keeps once ready. */
  keeps_days: number
  /** The raw ingredients for one batch, taken once (at soaking or cooking). */
  ingredients: Ingredient[]
  /** Prompt the next batch when this one is nearly finished. */
  keep_going: boolean
}

/** "Dosa uses 1 meal of idli/dosa batter". Stored on the dish, in `uses_prepared`. */
export interface PreparedUse {
  dish_id: string
  quantity: number
  optional?: boolean
  /** Better with older batter (uthappam, kuzhi paniyaram). */
  prefers_aged?: boolean
}

/** One batch, as started. Everything after the start is a BatchEvent. */
export interface Batch {
  id: string
  household_id: string
  /** Null if the dish has since been deleted; the names stay. */
  dish_id: string | null
  name_ta: string
  name_en: string
  /** This batch's stages: the plan's, with this batch's ferment time. */
  stages: PrepStage[]
  /** When the first stage is (or was) due. */
  planned_start: string
  /** The time it was planned to be ready for, if planned backwards. */
  ready_by: string | null
  yield: number
  unit: BatchUnit
  keeps_days: number
  created_by: string | null
  created_at: string
}

/**
 * One thing that happened to a batch. Never updated or deleted; the batch's state is
 * replayed from these, so both phones can mark glasses at once.
 * - done: action stage `stage` was done at occurred_at
 * - end: waiting stage `stage` finished at occurred_at (ready early)
 * - extend: waiting stage `stage` needs `quantity` more hours
 * - shift: late action stage `stage` is now due at occurred_at
 * - used: `quantity` meals or glasses used
 * - set: a correction: exactly `quantity` left
 * - discard: thrown away or stopped
 * - undo: cancels event `undoes`
 */
export type BatchEventKind = 'done' | 'end' | 'extend' | 'shift' | 'used' | 'set' | 'discard' | 'undo'

export interface BatchEvent {
  id: string
  household_id: string
  batch_id: string
  kind: BatchEventKind
  stage: number | null
  quantity: number | null
  undoes: string | null
  occurred_at: string
  created_by: string | null
  created_at: string
}
