import { describe, expect, test } from 'vitest'
import { formatClock, formatWhen } from '../lib/dates.ts'
import { batchState, liveEvents, type BatchState } from './batchState.ts'
import { usualHours } from './learn.ts'
import { prepPlan, preparedUses } from './plan.ts'
import { batchPrompt } from './prompts.ts'
import { readyPrepared, takeFromBatches } from './ready.ts'
import { mealTime, planBackwards, withHours } from './schedule.ts'
import type { Batch, BatchEvent, PrepStage } from './types.ts'

// Monday 5 Oct 2026, 6 pm. Tue 6, Wed 7, Thu 8 Oct.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const MON_6PM = at(5, 18)

const RAGI: PrepStage[] = [
  { key: 'soak', hours: 9, action: true, takes_ingredients: true },
  { key: 'cook', hours: 1, action: true },
  { key: 'ferment', hours: 24, action: false, adjustable: true },
]
const BATTER: PrepStage[] = [
  { key: 'soak', hours: 5, action: true, takes_ingredients: true },
  { key: 'grind', hours: 0, action: true },
  { key: 'ferment', hours: 10, action: false, adjustable: true },
]

const batch = (extra: Partial<Batch> = {}): Batch => ({
  id: 'b1',
  household_id: 'hh',
  dish_id: 'ragi_koozh',
  name_ta: 'கேழ்வரகுக் கூழ்',
  name_en: 'Ragi koozh',
  stages: RAGI,
  planned_start: at(6, 21).toISOString(),
  ready_by: at(8, 7).toISOString(),
  yield: 10,
  unit: 'glasses',
  keeps_days: 3,
  created_by: 'u1',
  created_at: MON_6PM.toISOString(),
  ...extra,
})

let n = 0
const ev = (kind: BatchEvent['kind'], when: Date, extra: Partial<BatchEvent> = {}): BatchEvent => ({
  id: `e${++n}`,
  household_id: 'hh',
  batch_id: 'b1',
  kind,
  stage: null,
  quantity: null,
  undoes: null,
  occurred_at: when.toISOString(),
  created_by: 'u1',
  created_at: when.toISOString(),
  ...extra,
})
const done = (stage: number, when: Date) => ev('done', when, { stage })
const used = (q: number, when: Date, by = 'u1') => ev('used', when, { quantity: q, created_by: by })

const prompt = (s: BatchState, now: Date, keepGoing = false, nextUnderWay = false) => batchPrompt(s, { now, keepGoing, nextUnderWay })

describe('reading a prep plan', () => {
  const plan = { stages: RAGI, yield: 10, unit: 'glasses', keeps_days: 3, ingredients: [{ item_id: 'ragi', quantity: 400 }], keep_going: true }
  test('a good plan', () => {
    expect(prepPlan({ prep_plan: plan })).toEqual(plan)
  })
  test('nonsense is no plan', () => {
    expect(prepPlan({ prep_plan: null })).toBeNull()
    expect(prepPlan({ prep_plan: { ...plan, stages: [] } })).toBeNull()
    expect(prepPlan({ prep_plan: { ...plan, unit: 'cups' } })).toBeNull()
    // It has to start with something to do, and exactly one stage takes the ingredients.
    expect(prepPlan({ prep_plan: { ...plan, stages: [RAGI[2], ...RAGI.slice(0, 2)] } })).toBeNull()
    expect(prepPlan({ prep_plan: { ...plan, stages: RAGI.map((s) => ({ ...s, takes_ingredients: false })) } })).toBeNull()
  })
  test('uses: bad entries are dropped', () => {
    expect(preparedUses({ uses_prepared: [{ dish_id: 'batter', quantity: 1 }, { dish_id: 'x', quantity: 0 }, 'junk'] })).toEqual([{ dish_id: 'batter', quantity: 1 }])
    expect(preparedUses({ uses_prepared: null })).toEqual([])
  })
})

describe('times', () => {
  test('clock and day', () => {
    expect(formatClock(at(5, 7))).toBe('7 am')
    expect(formatClock(at(5, 21, 30))).toBe('9:30 pm')
    expect(formatClock(at(5, 12))).toBe('12 pm')
    expect(formatClock(at(5, 0))).toBe('12 am')
    expect(formatWhen(at(5, 21), MON_6PM)).toBe('9 pm')
    expect(formatWhen(at(6, 7), MON_6PM)).toBe('tomorrow 7 am')
    expect(formatWhen(at(8, 7), MON_6PM)).toBe('Thu 7 am')
    expect(formatWhen(at(15, 7), MON_6PM)).toBe('Thu 15 Oct 7 am')
  })
})

describe('planning backwards', () => {
  test('koozh for Thursday breakfast: soak Tuesday night, cook Wednesday morning', () => {
    const s = planBackwards(RAGI, mealTime('2026-10-08', 'breakfast'), MON_6PM)
    expect(s.start).toEqual(at(6, 21))
    expect(s.readyAt).toEqual(at(8, 7))
    expect(s.tooLate).toBe(false)
  })

  test('no grinding at night: batter for lunch moves to the evening before, and is ready early', () => {
    // 16 hours back from 12:30 is soak 20:30, grind 01:30: grind moves to 21:00.
    const s = planBackwards(BATTER, mealTime('2026-10-07', 'lunch'), MON_6PM)
    expect(s.start).toEqual(at(6, 16))
    expect(s.readyAt).toEqual(at(7, 7))
  })

  test('too late to have it in time: start now', () => {
    const s = planBackwards(RAGI, mealTime('2026-10-06', 'breakfast'), MON_6PM)
    expect(s.start).toEqual(MON_6PM)
    expect(s.tooLate).toBe(true)
  })

  test('this batch’s ferment time', () => {
    expect(withHours(RAGI, 18).map((s) => s.hours)).toEqual([9, 1, 18])
  })
})

describe('a ragi koozh batch, start to finish', () => {
  const b = batch()

  test('planned: soak Tuesday 9 pm', () => {
    const s = batchState(b, [], MON_6PM)
    expect(s).toMatchObject({ phase: 'todo', stage: 0, lateHours: 0, readyAt: at(8, 7), remaining: 10 })
    expect(prompt(s, MON_6PM)).toEqual({
      detail: 'Soak tomorrow 9 pm · ready Thu 7 am',
      tone: 'green',
      actions: [
        { kind: 'done', label: 'Soaked' },
        { kind: 'stop', label: 'Cancel' },
      ],
    })
  })

  test('due, then late: the times move with it, and you can shift the plan', () => {
    const due = batchState(b, [], at(6, 21, 30))
    expect(prompt(due, at(6, 21, 30))?.detail).toBe('Soak now · ready Thu 7:30 am')
    expect(prompt(due, at(6, 21, 30))?.tone).toBe('amber')

    const late = batchState(b, [], at(7, 0, 15))
    expect(late.lateHours).toBe(3)
    expect(prompt(late, at(7, 0, 15))).toEqual({
      detail: 'Soak: 3 hours late · now ready tomorrow 10:15 am',
      tone: 'red',
      actions: [
        { kind: 'done', label: 'Soaked' },
        { kind: 'shift', label: 'Shift times' },
        { kind: 'stop', label: 'Stop' },
      ],
    })
    const shifted = batchState(b, [ev('shift', at(7, 0, 15), { stage: 0 })], at(7, 0, 30))
    expect(shifted.lateHours).toBe(0)
    expect(prompt(shifted, at(7, 0, 30))?.detail).toBe('Soak now · ready tomorrow 10:30 am')
  })

  const events = [done(0, at(6, 21, 10))]

  test('soaked: soaking, cook in the morning', () => {
    const s = batchState(b, events, at(6, 23))
    expect(s).toMatchObject({ phase: 'waiting', stage: 0, nextAction: { stage: 1, at: at(7, 6, 10) } })
    expect(prompt(s, at(6, 23))).toEqual({ detail: 'Soaking · cook tomorrow 6:10 am', tone: 'green', actions: [] })
  })

  test('cook time: cook now; a little late is not late', () => {
    const s = batchState(b, events, at(7, 7))
    expect(s).toMatchObject({ phase: 'todo', stage: 1, lateHours: 0 })
    expect(prompt(s, at(7, 7))?.detail).toBe('Cook now · ready tomorrow 8 am')
  })

  test('cooked: fermenting, with ready early or longer', () => {
    const cooked = [...events, done(1, at(7, 6, 30))]
    const s = batchState(b, cooked, at(7, 12))
    expect(s).toMatchObject({ phase: 'waiting', stage: 2, readyAt: at(8, 7, 30) })
    expect(prompt(s, at(7, 12))).toEqual({
      detail: 'Fermenting · ready tomorrow 7:30 am',
      tone: 'green',
      actions: [
        { kind: 'ready_now', label: 'Ready now' },
        { kind: 'extend', label: '+2 hours' },
      ],
    })
    expect(batchState(b, [...cooked, ev('extend', at(7, 12), { stage: 2, quantity: 2 })], at(7, 12)).readyAt).toEqual(at(8, 9, 30))
    expect(batchState(b, [...cooked, ev('end', at(8, 6), { stage: 2 })], at(8, 6)).phase).toBe('ready')
  })

  const ready = [...events, done(1, at(7, 6, 30))]

  test('ready: glasses count down, from both phones at once', () => {
    const s = batchState(b, ready, at(8, 8))
    expect(s).toMatchObject({ phase: 'ready', remaining: 10, expiresAt: at(11, 7, 30) })
    expect(prompt(s, at(8, 8))).toEqual({ detail: '10 glasses left · keeps till Sun 7:30 am', tone: 'green', actions: [{ kind: 'used', label: 'Had a glass' }] })

    const both = [...ready, used(1, at(8, 8)), used(1, at(8, 8), 'u2'), used(1, at(8, 9))]
    expect(batchState(b, both, at(8, 10)).remaining).toBe(7)
    // A correction sets it; later glasses count from there.
    expect(batchState(b, [...both, ev('set', at(8, 11), { quantity: 4 }), used(1, at(8, 12))], at(8, 13)).remaining).toBe(3)
  })

  test('nearly finished: amber; with keep it going, start the next', () => {
    const five = [...ready, used(5, at(8, 9))]
    const s = batchState(b, five, at(8, 10))
    expect(prompt(s, at(8, 10))?.tone).toBe('amber')
    expect(prompt(s, at(8, 10), true)).toEqual({
      detail: '5 glasses left · soak more tonight?',
      tone: 'amber',
      actions: [
        { kind: 'used', label: 'Had a glass' },
        { kind: 'next', label: 'Start the next' },
      ],
    })
    // Not if the next one is already on its way.
    expect(prompt(s, at(8, 10), true, true)?.actions).toHaveLength(1)
  })

  test('the last glass: used up, and gone from the strip', () => {
    const s = batchState(b, [...ready, used(9, at(8, 9)), used(1, at(9, 9))], at(9, 10))
    expect(s.phase).toBe('used_up')
    expect(prompt(s, at(9, 10))).toBeNull()
  })

  test('past its keeping time: thrown away', () => {
    const s = batchState(b, ready, at(11, 8))
    expect(s.phase).toBe('expired')
    expect(prompt(s, at(11, 8))).toEqual({ detail: 'Past its keeping time · 10 glasses left', tone: 'red', actions: [{ kind: 'stop', label: 'Thrown away' }] })
    expect(batchState(b, [...ready, ev('discard', at(11, 8))], at(11, 9)).phase).toBe('stopped')
  })

  test('undo cancels an event', () => {
    const glass = used(1, at(8, 9))
    const undo = ev('undo', at(8, 9), { undoes: glass.id })
    expect(batchState(b, [...ready, glass, undo], at(8, 10)).remaining).toBe(10)
    expect(liveEvents([glass, undo])).toEqual([])
    const unsoak = ev('undo', at(6, 21, 11), { undoes: events[0].id })
    expect(batchState(b, [...events, unsoak], at(6, 21, 12)).phase).toBe('todo')
  })

  test('cooked early: everything after moves earlier', () => {
    const early = [...events, done(1, at(7, 5))]
    expect(batchState(b, early, at(7, 6)).readyAt).toEqual(at(8, 6))
  })
})

describe('batter', () => {
  const b = batch({ id: 'b1', dish_id: 'batter', name_en: 'Idli/dosa batter', stages: BATTER, planned_start: at(5, 16).toISOString(), yield: 4, unit: 'meals' })
  test('ground: fermenting overnight, then meals; the last one asks to grind more', () => {
    const ground = [done(0, at(5, 16)), done(1, at(5, 21))]
    expect(prompt(batchState(b, ground, at(5, 22)), at(5, 22))?.detail).toBe('Fermenting · ready tomorrow 7 am')
    const last = batchState(b, [...ground, used(3, at(6, 8))], at(6, 9))
    expect(prompt(last, at(6, 9), true)?.detail).toBe('1 meal left · grind more tonight?')
    expect(prompt(last, at(6, 9))?.actions).toEqual([{ kind: 'used', label: 'Used a meal' }])
  })
})

describe('learning the ferment time', () => {
  const finished = (id: string, created: string, extraHours: number) => {
    const b = batch({ id, created_at: created, stages: BATTER, planned_start: at(1, 6).toISOString() })
    const evs = [done(0, at(1, 6)), done(1, at(1, 11)), ev('extend', at(1, 12), { stage: 2, quantity: extraHours })].map((e) => ({ ...e, batch_id: id }))
    return batchState(b, evs, at(4, 10))
  }
  test('the middle of the last five, to the half hour', () => {
    expect(usualHours(BATTER, [])).toBe(10)
    expect(usualHours(RAGI.slice(0, 2).map((s) => ({ ...s, takes_ingredients: true })), [])).toBeNull()
    const past = [finished('a', '1', 2), finished('b', '2', 4), finished('c', '3', -2), finished('d', '4', 1.2), finished('e', '5', 0), finished('f', '6', 3)]
    // The last five: 4, -2, 1.2, 0, 3 more hours: the middle is 11.2, so 11.
    expect(usualHours(BATTER, past)).toBe(11)
    expect(usualHours(BATTER, past.slice(0, 2))).toBe(13)
  })
  test('batches not finished yet don’t count', () => {
    const b = batch({ stages: BATTER })
    expect(usualHours(BATTER, [batchState(b, [], MON_6PM)])).toBe(10)
  })
})

describe('what’s ready', () => {
  const ready = (id: string, readyDay: number, left: number) => {
    const b = batch({ id, dish_id: 'batter', stages: BATTER, planned_start: at(readyDay - 1, 16).toISOString(), yield: 4, unit: 'meals' })
    const evs = [done(0, at(readyDay - 1, 16)), done(1, at(readyDay - 1, 21)), used(4 - left, at(readyDay, 8))].map((e) => ({ ...e, batch_id: id }))
    return batchState(b, evs, at(7, 12))
  }
  test('all ready batches of an item, oldest first; take from the oldest', () => {
    const r = readyPrepared([ready('new', 7, 4), ready('old', 5, 1)], at(7, 12)).get('batter')!
    expect(r).toMatchObject({ remaining: 5, ageDays: 2 })
    expect(r.batches.map((s) => s.batch.id)).toEqual(['old', 'new'])
    expect(takeFromBatches(r, 2)).toEqual([
      { batch_id: 'old', quantity: 1 },
      { batch_id: 'new', quantity: 1 },
    ])
    expect(takeFromBatches(undefined, 1)).toEqual([])
  })
})
