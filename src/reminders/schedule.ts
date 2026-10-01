// Which reminders are coming up, worked out on the phone from the same state the Plan
// strip and Shop tab use. Each has a stable key, so both phones write the same one.

import { MEAL_LABELS } from '../dishes/labels.ts'
import type { Dish, Meal } from '../dishes/types.ts'
import { addDays, formatClock, formatDay, localDate, parseLocalDate, type LocalDate } from '../lib/dates.ts'
import { comboIsNonVeg, type Combo } from '../plan/combos.ts'
import { comboPrepared } from '../plan/score.ts'
import { isActive, type BatchState } from '../prepared/batchState.ts'
import { amount, prepPlan, STAGE_LABELS } from '../prepared/plan.ts'
import type { NonVegNudge } from '../shop/build.ts'
import type { Item } from '../stock/types.ts'
import type { Reminder, ReminderDraft } from './types.ts'

const HOUR = 3_600_000

export const REMIND = {
  /** A step reminder is no use this long after the step was due. */
  stageExpiresHours: 3,
  /** "It's ready" is no use this long after. */
  readyExpiresHours: 12,
  /** "Tonight: soak at 9 pm" covers steps from this hour today … */
  tonightFromHour: 18,
  /** … to this hour tomorrow. */
  tomorrowUntilHour: 12,
  /** Running low lists this many items. */
  lowItems: 4,
} as const

export interface ScheduleInput {
  now: Date
  states: readonly BatchState[]
  /** Meals planned for tomorrow. */
  tomorrowMeals: readonly { date: LocalDate; meal: Meal; combo: Combo }[]
  /** Prepared items with a batch ready or under way. */
  preparedCovered: ReadonlySet<string>
  dishesById: ReadonlyMap<string, Dish>
  /** Fish or meat to buy (see nonVegNudges); only tomorrow's become reminders. */
  nudges: readonly NonVegNudge[]
  /** Running low, as the Shop tab has it. */
  lowItems: readonly Item[]
  /** In the person's chosen script. */
  name: (x: { name_ta: string; name_en: string }) => string
}

/** "Thu 7 am": absolute, since it may be read hours later. */
export function at(d: Date): string {
  return `${formatDay(localDate(d), { weekday: true }).split(' ')[0]} ${formatClock(d)}`
}

/** Midnight at the end of this local day. */
const endOfDay = (date: LocalDate) => {
  const d = parseLocalDate(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
}

const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export function upcomingReminders(input: ScheduleInput): ReminderDraft[] {
  const { now, name } = input
  const today = localDate(now)
  const tomorrow = addDays(today, 1)
  const out: ReminderDraft[] = []
  const evening = (key: string, type: ReminderDraft['type'], title: string, body: string, url: ReminderDraft['url']) =>
    out.push({ key, type, title, body, url, due_at: null, due_date: today, at_evening: true, expires_at: endOfDay(today) })

  const tonightFrom = new Date(parseLocalDate(today).getTime() + REMIND.tonightFromHour * HOUR)
  const tomorrowUntil = new Date(parseLocalDate(tomorrow).getTime() + REMIND.tomorrowUntilHour * HOUR)

  for (const s of input.states.filter(isActive)) {
    const { batch } = s
    const n = name(batch)
    const nextStage = s.phase === 'todo' ? s.stage : s.nextAction?.stage
    const nextAt = s.phase === 'todo' ? s.due : s.nextAction?.at
    if (nextStage !== undefined && nextAt) {
      const verb = STAGE_LABELS[batch.stages[nextStage].key].verb.toLowerCase()
      out.push({
        key: `stage:${batch.id}:${nextStage}`,
        type: 'stage',
        title: `${n}: ${verb} now`,
        body: `Ready ${at(s.readyAt)}`,
        url: '/plan',
        due_at: nextAt.toISOString(),
        due_date: null,
        at_evening: false,
        expires_at: new Date(nextAt.getTime() + REMIND.stageExpiresHours * HOUR).toISOString(),
      })
      // The evening before a step due tonight or tomorrow morning.
      if (nextAt.getTime() > now.getTime() && nextAt >= tonightFrom && nextAt < tomorrowUntil) {
        const when = localDate(nextAt) === today ? 'Tonight' : 'Tomorrow morning'
        evening(`tonight:${batch.id}:${nextStage}`, 'prep', `${when}: ${verb} ${n} at ${formatClock(nextAt)}`, `Ready ${at(s.readyAt)}`, '/plan')
      }
    }
    // "It's ready", when the last stage runs by the clock (fermenting, resting).
    const last = batch.stages.at(-1)!
    if ((s.phase === 'todo' || s.phase === 'waiting') && !last.action) {
      out.push({
        key: `ready:${batch.id}`,
        type: 'stage',
        title: `${n} is ready`,
        body: `${amount(batch.yield, batch.unit)} · keeps till ${at(s.expiresAt)}`,
        url: '/plan',
        due_at: s.readyAt.toISOString(),
        due_date: null,
        at_evening: false,
        expires_at: new Date(s.readyAt.getTime() + REMIND.readyExpiresHours * HOUR).toISOString(),
      })
    }
    // Its last day is tomorrow.
    if (s.phase === 'ready' && localDate(s.expiresAt) === tomorrow) {
      evening(`expiry:${batch.id}`, 'expiry', `${n}: use it by tomorrow`, `${amount(s.remaining, s.unit)} left`, '/stock')
    }
  }

  for (const m of input.tomorrowMeals) {
    const main = name(m.combo.main)
    const when = `tomorrow's ${MEAL_LABELS[m.meal].toLowerCase()}`
    for (const use of comboPrepared(m.combo)) {
      if (use.optional || input.preparedCovered.has(use.dish_id)) continue
      const dish = input.dishesById.get(use.dish_id)
      const plan = dish ? prepPlan(dish) : null
      if (!dish || !plan) continue
      const steps = list(plan.stages.filter((st) => st.action).map((st) => STAGE_LABELS[st.key].verb.toLowerCase()))
      evening(`prep:${m.date}:${m.meal}:${dish.id}`, 'prep', `${main} for ${when}`, `Needs ${name(dish)}: ${steps} tonight.`, '/plan')
    }
    if (comboIsNonVeg(m.combo)) {
      evening(`defrost:${m.date}:${m.meal}`, 'prep', `${main} for ${when}`, "Take the meat or fish out to defrost, if it's frozen.", '/plan')
    }
  }

  for (const nudge of input.nudges) {
    if (nudge.date !== tomorrow) continue
    const items = nudge.items.slice(0, 3).map(name)
    evening(`nonveg:${nudge.date}`, 'nonveg', 'Tomorrow is a non-veg day', `Fish or meat? ${list(items)}.`, '/shop')
  }

  if (input.lowItems.length) {
    const names = input.lowItems.slice(0, REMIND.lowItems).map(name)
    const more = input.lowItems.length - names.length
    evening(`low:${today}`, 'low', 'Running low', `${names.join(', ')}${more > 0 ? ` and ${more} more` : ''}`, '/shop')
  }

  return out
}

/** What to write so the table matches: new or changed reminders, and ones that no longer apply. */
export function reminderChanges(existing: readonly Reminder[], drafts: readonly ReminderDraft[], householdId: string) {
  const byId = new Map(existing.map((r) => [r.id, r]))
  const fields = ['type', 'title', 'body', 'url', 'due_at', 'due_date', 'at_evening', 'expires_at'] as const
  const upserts = drafts
    .map((d) => ({ ...d, id: `${householdId}:${d.key}`, household_id: householdId }))
    .filter((d) => {
      const e = byId.get(d.id)
      return !e || fields.some((f) => e[f] !== d[f])
    })
  const keep = new Set(drafts.map((d) => `${householdId}:${d.key}`))
  const deletes = existing.filter((r) => !keep.has(r.id)).map((r) => r.id)
  return { upserts, deletes }
}
