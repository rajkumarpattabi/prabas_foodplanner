import { useId, useMemo, useState } from 'react'
import { Segmented } from '../components/Segmented.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { MEAL_LABELS } from '../dishes/labels.ts'
import { MEALS, type Dish, type Meal } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, formatDay, formatWhen, localDate, type LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { inputClass, primaryClass } from '../stock/labels.ts'
import { useBatches } from './batchContext.ts'
import { batchState } from './batchState.ts'
import { usualHours } from './learn.ts'
import { adjustableStage, amount, prepPlan, STAGE_LABELS, totalHours } from './plan.ts'
import { mealTime, planBackwards, withHours } from './schedule.ts'
import type { Batch } from './types.ts'

type Mode = 'now' | 'ready_by'

const MODES: { value: Mode; label: string }[] = [
  { value: 'now', label: 'Start now' },
  { value: 'ready_by', label: 'Ready by' },
]
const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))
/** How far ahead "ready by" can be. */
const DAYS_AHEAD = 7
const HOUR = 3_600_000

interface Props {
  now: Date
  /** Start with this item chosen (for "start the next"). */
  dishId?: string | null
  onClose: () => void
  /** Started now: its first stage is being done, so its sheet opens next. */
  onStartedNow: (batch: Batch) => void
}

/** Start a batch: pick what, then start now, or plan backwards from when it's wanted. */
export function StartBatchSheet({ now, dishId, onClose, onStartedNow }: Props) {
  const { dishes } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  const name = (d: Pick<Dish, 'name_ta' | 'name_en'>) => namePair(d, pref)[0]
  const prepared = useMemo(
    () => dishes.filter((d) => prepPlan(d)).sort((a, b) => namePair(a, pref)[0].localeCompare(namePair(b, pref)[0])),
    [dishes, pref],
  )
  const [chosen, setChosen] = useState<string | null>(dishId ?? null)
  const dish = prepared.find((d) => d.id === chosen)

  return (
    <Sheet title={dish ? `Start ${name(dish)}` : 'Start a batch'} onClose={onClose}>
      {dish ? (
        <StartForm dish={dish} now={now} onBack={dishId ? null : () => setChosen(null)} onClose={onClose} onStartedNow={onStartedNow} />
      ) : prepared.length ? (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Made ahead">
          {prepared.map((d) => {
            const [first, second] = namePair(d, pref)
            return (
              <li key={d.id}>
                <button type="button" onClick={() => setChosen(d.id)} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{first}</span>
                    <span className="block truncate text-xs text-ink-muted">{second}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Nothing made ahead in your dishes yet.</p>
      )}
    </Sheet>
  )
}

function StartForm({ dish, now, onBack, onClose, onStartedNow }: { dish: Dish; now: Date; onBack: (() => void) | null; onClose: () => void; onStartedNow: (batch: Batch) => void }) {
  const { batches, events, startBatch, removeBatch } = useBatches()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const plan = prepPlan(dish)!
  const [first] = namePair(dish, pref)
  const dayId = useId()
  const hoursId = useId()

  const adjustable = adjustableStage(plan.stages)
  const usual = useMemo(
    () => usualHours(plan.stages, batches.filter((b) => b.dish_id === dish.id).map((b) => batchState(b, events, now))),
    [plan.stages, batches, events, dish.id, now],
  )
  const [mode, setMode] = useState<Mode>('ready_by')
  const today = localDate(now)
  const [day, setDay] = useState<LocalDate>(addDays(today, 1))
  const [meal, setMeal] = useState<Meal>('breakfast')
  const [hoursText, setHoursText] = useState(usual === null ? '' : String(usual))
  const hours = Number(hoursText)
  const hoursOk = adjustable < 0 || (hoursText.trim() !== '' && hours > 0 && hours <= 72)
  const stages = adjustable >= 0 && hoursOk ? withHours(plan.stages, hours) : plan.stages

  const when = (d: Date) => formatWhen(d, now)
  const verb = STAGE_LABELS[stages[0].key].verb
  const schedule = mode === 'ready_by' ? planBackwards(stages, mealTime(day, meal), now) : null
  const readyAt = schedule ? schedule.readyAt : new Date(now.getTime() + totalHours(stages) * HOUR)
  const summary = schedule
    ? schedule.tooLate
      ? `Can't be ready by then: ${verb.toLowerCase()} now, ready ${when(readyAt)}`
      : `${verb} ${when(schedule.start)} · ready ${when(readyAt)}`
    : `Ready ${when(readyAt)}`

  const start = () => {
    const batch = startBatch({
      dish_id: dish.id,
      name_ta: dish.name_ta,
      name_en: dish.name_en,
      stages,
      planned_start: schedule ? schedule.start : now,
      ready_by: schedule ? mealTime(day, meal) : null,
      yield: plan.yield,
      unit: plan.unit,
      keeps_days: plan.keeps_days,
    })
    toast(`${first} ${mode === 'now' ? 'started' : `planned · ${verb.toLowerCase()} ${when(schedule!.start)}`}`, { undo: () => removeBatch(batch.id) })
    if (mode === 'now') onStartedNow(batch)
    else onClose()
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-ink-muted">Makes {amount(plan.yield, plan.unit)} · keeps {plan.keeps_days} {plan.keeps_days === 1 ? 'day' : 'days'}</p>
      <Segmented label="When" options={MODES} value={mode} onChange={setMode} />
      {mode === 'ready_by' && (
        <div className="space-y-2">
          <div>
            <label htmlFor={dayId} className="text-sm font-medium">
              Day
            </label>
            <select id={dayId} value={day} onChange={(e) => setDay(e.target.value)} className={`mt-1 ${inputClass}`}>
              {Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)).map((d) => (
                <option key={d} value={d}>
                  {d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : formatDay(d, { weekday: true })}
                </option>
              ))}
            </select>
          </div>
          <Segmented label="For" options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
        </div>
      )}
      {adjustable >= 0 && (
        <div>
          <label htmlFor={hoursId} className="text-sm font-medium">
            {STAGE_LABELS[plan.stages[adjustable].key].verb} for (hours)
          </label>
          <input id={hoursId} inputMode="decimal" value={hoursText} onChange={(e) => setHoursText(e.target.value)} className={`mt-1 ${inputClass}`} />
          <p className="mt-1 text-xs text-ink-muted">Usually {usual} hours here. Less in hot weather, more when it's cool.</p>
        </div>
      )}
      <p className={`rounded-xl px-3 py-2 text-sm font-medium ${schedule?.tooLate ? 'bg-turmeric-fill text-turmeric-strong' : 'bg-leaf-fill text-leaf-strong'}`}>
        {hoursOk ? summary : 'Enter the hours, up to 72'}
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" disabled={!hoursOk} onClick={start} className={primaryClass}>
          {mode === 'now' ? `${STAGE_LABELS[stages[0].key].verb} now` : 'Plan it'}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="min-h-12 w-full rounded-xl font-medium">
            Pick something else
          </button>
        )}
      </div>
    </div>
  )
}
