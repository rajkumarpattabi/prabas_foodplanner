import { useMemo } from 'react'
import { useCalendar } from '../calendar/calendarContext.ts'
import { dayContext } from '../calendar/dayContext.ts'
import { nonVegTargets } from '../calendar/rhythm.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { MEALS } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, formatWhen, localDate, type LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { comboFromMeal, comboIsNonVeg, combosFor, usableLeftovers } from '../plan/combos.ts'
import { useMeals } from '../plan/mealContext.ts'
import { nextMeal } from '../plan/mealTime.ts'
import { suggest } from '../plan/score.ts'
import { usePlanContext } from '../plan/usePlanContext.ts'
import { useBatches } from '../prepared/batchContext.ts'
import { batchState, isActive } from '../prepared/batchState.ts'
import { prepPlan, STAGE_LABELS } from '../prepared/plan.ts'
import { useNow } from '../prepared/useNow.ts'
import { useStock } from '../stock/stockContext.ts'
import { stockRows } from '../stock/view.ts'
import { buildShoppingList, nonVegNudges, SHOP, type BatchNeed, type MealNeed, type NonVegNudge, type ShopLine } from './build.ts'
import { useShopping } from './shoppingContext.ts'

export interface ShoppingList {
  ready: boolean
  today: LocalDate
  lines: ShopLine[]
  nudges: NonVegNudge[]
}

/** The shopping list as it stands: from stock, plans, likely meals, batches, the calendar and what was added. */
export function useShoppingList(): ShoppingList {
  const now = useNow()
  const today = localDate(now)
  const { status: stockStatus, items, eventsByItem } = useStock()
  const { status: dishStatus, dishes, dishesById } = useDishes()
  const { status: mealStatus, meals, leftovers } = useMeals()
  const { status: calendarStatus, days } = useCalendar()
  const { status: batchStatus, batches, events } = useBatches()
  const { status: shopStatus, rows: shopping } = useShopping()
  const { me, members } = useReadyHousehold()
  const ctx = usePlanContext(today)
  const ready = [stockStatus, dishStatus, mealStatus, calendarStatus, batchStatus, shopStatus].every((s) => s === 'ready')

  return useMemo(() => {
    if (!ready) return { ready, today, lines: [], nudges: [] }
    const rows = stockRows(items, eventsByItem, now)
    const pref = me.script_pref
    const name = (x: { name_ta: string; name_en: string }) => namePair(x, pref)[0]
    const names = new Map(members.map((m) => [m.userId, m.profile?.display_name ?? '']))
    const last = addDays(today, SHOP.horizonDays - 1)
    const inHorizon = (d: LocalDate) => d >= today && d <= last

    // Planned, not yet cooked.
    const planned: MealNeed[] = meals
      .filter((m) => m.status === 'planned' && inHorizon(m.date))
      .flatMap((m) => {
        const combo = comboFromMeal(m.dish_ids, dishesById, usableLeftovers(leftovers, m.date))
        return combo ? [{ date: m.date, meal: m.meal, combo }] : []
      })

    // Likely meals: the top suggestion for the next few meals nobody has planned.
    const taken = new Set(meals.map((m) => `${m.date}:${m.meal}`))
    const next = nextMeal(now)
    const slots: { date: LocalDate; meal: (typeof MEALS)[number] }[] = []
    for (let d = next.date; d <= last && slots.length < SHOP.maybeMeals; d = addDays(d, 1)) {
      for (const meal of MEALS) {
        if (d === next.date && MEALS.indexOf(meal) < MEALS.indexOf(next.meal)) continue
        if (!taken.has(`${d}:${meal}`) && slots.length < SHOP.maybeMeals) slots.push({ date: d, meal })
      }
    }
    const maybe: MealNeed[] = slots.flatMap(({ date, meal }) => {
      const day = dayContext(date, days)
      const usable = usableLeftovers(leftovers, date)
      const top = suggest(combosFor(meal, dishes, usable, { vegOnly: day.vegOnly }), { ...ctx, today: date, nonVegDay: day.nonVegDay }, `${date}:${meal}`).picks[0]
      return top ? [{ date, meal, combo: top.combo }] : []
    })

    // Batches whose ingredients are still to be taken, and items with a batch on the go.
    const states = batches.map((b) => batchState(b, events, now)).filter(isActive)
    const batchNeeds: BatchNeed[] = states.flatMap((s) => {
      const i = s.batch.stages.findIndex((st) => st.takes_ingredients)
      if (i < 0 || s.times[i].done) return []
      const dish = s.batch.dish_id ? dishesById.get(s.batch.dish_id) : undefined
      const plan = dish ? prepPlan(dish) : null
      if (!plan) return []
      const at = s.times[i].start
      return [{ label: `${name(s.batch)} · ${STAGE_LABELS[s.batch.stages[i].key].verb.toLowerCase()} ${formatWhen(at, now)}`, date: localDate(at), ingredients: plan.ingredients }]
    })
    const preparedCovered = new Set(states.filter((s) => s.remaining > 0 && s.batch.dish_id).map((s) => s.batch.dish_id!))

    const lines = buildShoppingList({
      today,
      rows,
      trackedItemIds: new Set(rows.filter((r) => r.events.length > 0).map((r) => r.item.id)),
      planned,
      maybe,
      batches: batchNeeds,
      preparedCovered,
      dishesById,
      shopping,
      calendar: days,
      dishName: name,
      personName: (id) => (id === me.user_id ? 'you' : (id && names.get(id)) || 'someone'),
    })

    // Fish or meat for today's or tomorrow's non-veg day, if nothing non-veg is planned for it.
    const tomorrow = addDays(today, 1)
    const targets = new Set(nonVegTargets(today, tomorrow, days).keys())
    const plannedNonVegDates = new Set(
      meals
        .filter((m) => m.date === today || m.date === tomorrow)
        .filter((m) => {
          const combo = comboFromMeal(m.dish_ids, dishesById)
          return combo !== null && comboIsNonVeg(combo)
        })
        .map((m) => m.date),
    )
    const nudges = nonVegNudges({ today, targets, plannedNonVegDates, rows })
    return { ready, today, lines, nudges }
  }, [ready, today, now, items, eventsByItem, dishes, dishesById, meals, leftovers, days, batches, events, shopping, me, members, ctx])
}
