import { useMemo, useState, type ReactNode } from 'react'
import { useToast } from '../components/toastContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { useStock } from '../stock/stockContext.ts'
import { useBatches } from './batchContext.ts'
import { batchState, isActive, type BatchState } from './batchState.ts'
import { amount, prepPlan, STAGE_LABELS } from './plan.ts'
import { batchPrompt, EXTEND_HOURS, type BatchAction, type BatchPrompt, type Tone } from './prompts.ts'
import { StageSheet } from './StageSheet.tsx'
import { StartBatchSheet } from './StartBatchSheet.tsx'
import type { Batch } from './types.ts'

const TONE_ORDER: Record<Tone, number> = { red: 0, amber: 1, green: 2 }
const TONE_CLASS: Record<Tone, string> = {
  red: 'border-red bg-red-fill text-red',
  amber: 'border-turmeric bg-turmeric-fill text-turmeric-strong',
  green: 'border-line bg-surface text-leaf-strong',
}

/**
 * Batches under way, at the top of Plan, with what to do next; the plan in between;
 * and "Start a batch" below it.
 */
export function InProgress({ now, children }: { now: Date; children: ReactNode }) {
  const { status, batches, events, addEvent } = useBatches()
  const { status: dishStatus, dishesById } = useDishes()
  // Stock too: doing a stage takes from it.
  const { status: stockStatus } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [staging, setStaging] = useState<{ batch: Batch; stage: number } | null>(null)
  const [starting, setStarting] = useState<{ dishId: string | null } | null>(null)

  const rows = useMemo(() => {
    const states = batches.map((b) => batchState(b, events, now)).filter(isActive)
    const underWay = (s: BatchState) => states.some((o) => o !== s && o.batch.dish_id === s.batch.dish_id && (o.phase === 'todo' || o.phase === 'waiting'))
    return states
      .map((s) => {
        const dish = s.batch.dish_id ? dishesById.get(s.batch.dish_id) : undefined
        const keepGoing = !!(dish && prepPlan(dish)?.keep_going)
        return { state: s, prompt: batchPrompt(s, { now, keepGoing, nextUnderWay: underWay(s) }) }
      })
      .filter((r): r is { state: BatchState; prompt: BatchPrompt } => r.prompt !== null)
      .sort((a, b) => TONE_ORDER[a.prompt.tone] - TONE_ORDER[b.prompt.tone] || a.state.readyAt.getTime() - b.state.readyAt.getTime())
  }, [batches, events, now, dishesById])

  const ready = status === 'ready' && dishStatus === 'ready' && stockStatus === 'ready'

  const onAction = (s: BatchState, a: BatchAction) => {
    const { batch } = s
    const [first] = namePair(batch, pref)
    const undoable = (message: string, event: { id: string }) =>
      toast(message, { undo: () => addEvent(batch.id, { kind: 'undo', undoes: event.id }) })
    switch (a.kind) {
      case 'done':
        if (batch.stages[s.stage].takes_ingredients && batch.dish_id) setStaging({ batch, stage: s.stage })
        else undoable(`${first} ${STAGE_LABELS[batch.stages[s.stage].key].done.toLowerCase()}`, addEvent(batch.id, { kind: 'done', stage: s.stage }))
        return
      case 'shift':
        undoable(`${first}: times shifted`, addEvent(batch.id, { kind: 'shift', stage: s.stage }))
        return
      case 'stop':
        undoable(`${first} ${a.label === 'Thrown away' ? 'thrown away' : 'stopped'}`, addEvent(batch.id, { kind: 'discard' }))
        return
      case 'used':
        undoable(`${first} · ${amount(Math.max(0, s.remaining - 1), s.unit)} left`, addEvent(batch.id, { kind: 'used', quantity: 1 }))
        return
      case 'ready_now':
        undoable(`${first} is ready`, addEvent(batch.id, { kind: 'end', stage: s.stage }))
        return
      case 'extend':
        undoable(`${first}: ${EXTEND_HOURS} more hours`, addEvent(batch.id, { kind: 'extend', stage: s.stage, quantity: EXTEND_HOURS }))
        return
      case 'next':
        setStarting({ dishId: batch.dish_id })
    }
  }

  return (
    <>
      {ready && rows.length > 0 && (
        <section aria-labelledby="in-progress" className="mb-4">
          <h2 id="in-progress" className="text-sm font-semibold text-ink-muted">
            In progress
          </h2>
          <ul className="mt-2 space-y-2">
            {rows.map(({ state, prompt }) => {
              const [first, second] = namePair(state.batch, pref)
              return (
                <li key={state.batch.id}>
                  <article aria-label={first} className={`rounded-2xl border p-3 ${TONE_CLASS[prompt.tone]}`}>
                    <p className="font-medium text-ink">
                      {first} <span className="text-xs font-normal text-ink-muted">{second}</span>
                    </p>
                    <p className="text-sm font-medium">{prompt.detail}</p>
                    {prompt.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {prompt.actions.map((a, i) => (
                          <button
                            key={a.kind}
                            type="button"
                            onClick={() => onAction(state, a)}
                            className={`min-h-11 rounded-xl px-4 text-sm font-medium ${i === 0 ? 'bg-leaf text-bg' : 'border border-line bg-surface text-ink'}`}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {children}
      {ready && (
        <button type="button" onClick={() => setStarting({ dishId: null })} className="mt-6 min-h-12 w-full rounded-xl border border-dashed border-line font-medium text-leaf-strong">
          + Start a batch
        </button>
      )}
      {staging && <StageSheet batch={staging.batch} stage={staging.stage} now={now} onClose={() => setStaging(null)} />}
      {starting && (
        <StartBatchSheet
          now={now}
          dishId={starting.dishId}
          onClose={() => setStarting(null)}
          onStartedNow={(batch) => {
            setStarting(null)
            // Being done now: the first stage's stock to take, or just done.
            if (batch.stages[0].takes_ingredients) setStaging({ batch, stage: 0 })
            else addEvent(batch.id, { kind: 'done', stage: 0 })
          }}
        />
      )}
    </>
  )
}
