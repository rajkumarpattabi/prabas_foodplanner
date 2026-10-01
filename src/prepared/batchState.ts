// A batch's state, replayed from its start and its events: which stage it's at, when
// each stage starts and ends, when it's ready, what's left, and whether a step is late.

import type { Batch, BatchEvent, BatchUnit } from './types.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A step left this long past its time counts as late. */
export const LATE_AFTER_HOURS = 2

export type BatchPhase =
  /** An action stage is next: due now, late, or later. */
  | 'todo'
  /** Waiting on the clock: soaking, fermenting, resting. */
  | 'waiting'
  | 'ready'
  | 'used_up'
  /** Past its keeping time, with some left. */
  | 'expired'
  /** Thrown away or stopped. */
  | 'stopped'

export interface StageTime {
  start: Date
  end: Date
  /** An action stage that's been done. */
  done: boolean
}

export interface BatchState {
  batch: Batch
  phase: BatchPhase
  /** todo: the stage to do. waiting: the stage running now. Otherwise the last stage. */
  stage: number
  /** todo: when that stage is (or was) due. */
  due: Date | null
  /** todo: whole hours late, once past LATE_AFTER_HOURS; otherwise 0. */
  lateHours: number
  /** waiting: the next thing to do, if anything is left to do. */
  nextAction: { stage: number; at: Date } | null
  /** Steps not done yet are counted from now if their time has passed. */
  times: StageTime[]
  readyAt: Date
  expiresAt: Date
  /** Meals or glasses left. Counts from the yield even before it's ready. */
  remaining: number
  unit: BatchUnit
}

const byTime = (a: BatchEvent, b: BatchEvent) => a.occurred_at.localeCompare(b.occurred_at) || a.created_at.localeCompare(b.created_at)

/** The events that count: undo events, and the events they cancel, are left out. */
export function liveEvents(events: readonly BatchEvent[]): BatchEvent[] {
  const undone = new Set(events.filter((e) => e.kind === 'undo' && e.undoes).map((e) => e.undoes!))
  return events.filter((e) => e.kind !== 'undo' && !undone.has(e.id)).sort(byTime)
}

export function batchState(batch: Batch, allEvents: readonly BatchEvent[], now: Date): BatchState {
  const events = liveEvents(allEvents.filter((e) => e.batch_id === batch.id))
  const at = (e: BatchEvent) => new Date(e.occurred_at)
  const first = (kind: BatchEvent['kind'], stage: number) => events.find((e) => e.kind === kind && e.stage === stage)
  const stages = batch.stages

  const times: StageTime[] = []
  let dueOf: Date | null = null
  let prevEnd = new Date(batch.planned_start)
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    let start: Date
    let done = false
    if (s.action) {
      const doneEvent = first('done', i)
      if (doneEvent) {
        start = at(doneEvent)
        done = true
      } else {
        const shifts = events.filter((e) => e.kind === 'shift' && e.stage === i)
        let due = prevEnd
        if (shifts.length) due = new Date(Math.max(due.getTime(), at(shifts.at(-1)!).getTime()))
        if (dueOf === null) dueOf = due
        // Not done yet: it can't start before now.
        start = new Date(Math.max(due.getTime(), now.getTime()))
      }
    } else {
      start = prevEnd
    }
    const ended = first('end', i)
    const extra = events.filter((e) => e.kind === 'extend' && e.stage === i).reduce((h, e) => h + (e.quantity ?? 0), 0)
    const end = !s.action && ended ? at(ended) : new Date(start.getTime() + (s.hours + extra) * HOUR)
    times.push({ start, end, done })
    prevEnd = end
  }

  const readyAt = times.at(-1)!.end
  const expiresAt = new Date(readyAt.getTime() + batch.keeps_days * DAY)

  let remaining = batch.yield
  for (const e of events) {
    if (e.kind === 'used') remaining -= e.quantity ?? 0
    if (e.kind === 'set') remaining = e.quantity ?? 0
  }
  remaining = Math.max(0, remaining)

  const base = { batch, times, readyAt, expiresAt, remaining, unit: batch.unit, due: null, lateHours: 0, nextAction: null }
  const last = stages.length - 1
  if (events.some((e) => e.kind === 'discard')) return { ...base, phase: 'stopped', stage: last }

  /** The stage running now: the latest that has started. */
  const running = (before: number) => {
    let j = 0
    for (let i = 0; i < before; i++) if (times[i].start.getTime() <= now.getTime()) j = i
    return j
  }

  const next = stages.findIndex((s, i) => s.action && !times[i].done)
  if (next >= 0) {
    const due = dueOf!
    const nextStart = times[next].start
    if (next > 0 && now.getTime() < due.getTime()) {
      return { ...base, phase: 'waiting', stage: running(next), nextAction: { stage: next, at: nextStart } }
    }
    const late = (now.getTime() - due.getTime()) / HOUR
    return { ...base, phase: 'todo', stage: next, due, lateHours: late > LATE_AFTER_HOURS ? Math.floor(late) : 0 }
  }
  if (now.getTime() < readyAt.getTime()) return { ...base, phase: 'waiting', stage: running(stages.length) }
  if (remaining <= 0) return { ...base, phase: 'used_up', stage: last }
  if (now.getTime() >= expiresAt.getTime()) return { ...base, phase: 'expired', stage: last }
  return { ...base, phase: 'ready', stage: last }
}

/** Still to be finished: planned, under way, ready or past its time. */
export const isActive = (s: BatchState) => s.phase !== 'used_up' && s.phase !== 'stopped'

/** Days since it was ready, in whole days. */
export const ageDays = (s: BatchState, now: Date) => Math.max(0, Math.floor((now.getTime() - s.readyAt.getTime()) / DAY))
