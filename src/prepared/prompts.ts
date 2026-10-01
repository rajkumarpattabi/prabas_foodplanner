// The "In progress" strip: one line per batch, saying where it is and what to do next.

import { formatWhen } from '../lib/dates.ts'
import type { BatchState } from './batchState.ts'
import { amount, STAGE_LABELS } from './plan.ts'

/** Left at or below this, it's nearly finished: time to start the next (keep it going). */
export const NEARLY_FINISHED = { meals: 1, glasses: 5 } as const

/** "Needs longer" adds this many hours to a waiting stage. */
export const EXTEND_HOURS = 2

export type BatchActionKind = 'done' | 'shift' | 'stop' | 'used' | 'ready_now' | 'extend' | 'next'

export interface BatchAction {
  kind: BatchActionKind
  label: string
}

export type Tone = 'red' | 'amber' | 'green'

export interface BatchPrompt {
  /** "Soak now · ready Thu 7 am" */
  detail: string
  /** red: late or past its time; amber: to do now, or nearly finished; green: on track. */
  tone: Tone
  actions: BatchAction[]
}

export interface PromptOptions {
  now: Date
  /** The item's "keep it going" is on. */
  keepGoing: boolean
  /** Another batch of the same item is already planned or under way. */
  nextUnderWay: boolean
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** What to say for a batch; null once it's used up or stopped. */
export function batchPrompt(state: BatchState, { now, keepGoing, nextUnderWay }: PromptOptions): BatchPrompt | null {
  const { batch, phase } = state
  const when = (d: Date) => formatWhen(d, now)
  const ready = `ready ${when(state.readyAt)}`
  const stage = batch.stages[state.stage]
  const label = STAGE_LABELS[stage.key]

  switch (phase) {
    case 'todo': {
      const done: BatchAction = { kind: 'done', label: label.done }
      if (state.lateHours > 0) {
        const late = `${state.lateHours} ${state.lateHours === 1 ? 'hour' : 'hours'} late`
        return {
          detail: `${label.verb}: ${late} · now ${ready}`,
          tone: 'red',
          actions: [done, { kind: 'shift', label: 'Shift times' }, { kind: 'stop', label: 'Stop' }],
        }
      }
      if (state.due!.getTime() <= now.getTime()) return { detail: `${label.verb} now · ${ready}`, tone: 'amber', actions: [done] }
      const actions: BatchAction[] = [done]
      if (state.stage === 0) actions.push({ kind: 'stop', label: 'Cancel' })
      return { detail: `${label.verb} ${when(state.due!)} · ${ready}`, tone: 'green', actions }
    }
    case 'waiting': {
      const next = state.nextAction
      const then = next ? `${STAGE_LABELS[batch.stages[next.stage].key].verb.toLowerCase()} ${when(next.at)}` : ready
      const actions: BatchAction[] = stage.adjustable
        ? [
            { kind: 'ready_now', label: 'Ready now' },
            { kind: 'extend', label: `+${EXTEND_HOURS} hours` },
          ]
        : []
      return { detail: `${cap(label.doing)} · ${then}`, tone: 'green', actions }
    }
    case 'ready': {
      const used: BatchAction = { kind: 'used', label: state.unit === 'glasses' ? 'Had a glass' : 'Used a meal' }
      const left = `${amount(state.remaining, state.unit)} left`
      const nearly = state.remaining <= NEARLY_FINISHED[state.unit]
      if (nearly && keepGoing && !nextUnderWay) {
        const restart = batch.stages.find((s) => s.key === 'grind') ?? batch.stages[0]
        return {
          detail: `${left} · ${STAGE_LABELS[restart.key].verb.toLowerCase()} more tonight?`,
          tone: 'amber',
          actions: [used, { kind: 'next', label: 'Start the next' }],
        }
      }
      return { detail: `${left} · keeps till ${when(state.expiresAt)}`, tone: nearly ? 'amber' : 'green', actions: [used] }
    }
    case 'expired':
      return {
        detail: `Past its keeping time · ${amount(state.remaining, state.unit)} left`,
        tone: 'red',
        actions: [{ kind: 'stop', label: 'Thrown away' }],
      }
    default:
      return null
  }
}
