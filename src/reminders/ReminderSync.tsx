import { useEffect } from 'react'
import { useDishes } from '../dishes/dishContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { useClock } from '../lib/clock.ts'
import { addDays, localDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { comboFromMeal } from '../plan/combos.ts'
import { useMeals } from '../plan/mealContext.ts'
import { useBatches } from '../prepared/batchContext.ts'
import { batchState, isActive } from '../prepared/batchState.ts'
import { useShoppingList } from '../shop/useShoppingList.ts'
import { useReminders } from './reminderContext.ts'
import { reminderChanges, upcomingReminders } from './schedule.ts'

/** Waits for changes to settle before writing, so a burst of edits is one write. */
export const SETTLE_MS = 1500

/**
 * Keeps the household's reminders table in step with what's coming up: batch steps,
 * tomorrow's prep, shopping. Shows nothing; the send-reminders function does the sending.
 */
export function ReminderSync() {
  const clock = useClock()
  const { household, me } = useReadyHousehold()
  const { status: batchStatus, batches, events } = useBatches()
  const { status: mealStatus, meals } = useMeals()
  const { status: dishStatus, dishesById } = useDishes()
  const list = useShoppingList()
  const { status, reminders, applyChanges } = useReminders()
  const ready = status === 'ready' && batchStatus === 'ready' && mealStatus === 'ready' && dishStatus === 'ready' && list.ready

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      const now = clock()
      const tomorrow = addDays(localDate(now), 1)
      const states = batches.map((b) => batchState(b, events, now))
      const tomorrowMeals = meals
        .filter((m) => m.status === 'planned' && m.date === tomorrow)
        .flatMap((m) => {
          const combo = comboFromMeal(m.dish_ids, dishesById)
          return combo ? [{ date: m.date, meal: m.meal, combo }] : []
        })
      const preparedCovered = new Set(states.filter((s) => isActive(s) && s.remaining > 0 && s.batch.dish_id).map((s) => s.batch.dish_id!))
      const drafts = upcomingReminders({
        now,
        states,
        tomorrowMeals,
        preparedCovered,
        dishesById,
        nudges: list.nudges,
        lowItems: list.lines.filter((l) => l.section === 'low').map((l) => l.item),
        name: (x) => namePair(x, me.script_pref)[0],
      })
      const changes = reminderChanges(reminders, drafts, household.id)
      if (changes.upserts.length || changes.deletes.length) applyChanges(changes)
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [ready, clock, batches, events, meals, dishesById, list, reminders, household.id, me.script_pref, applyChanges])

  return null
}
