import { useMemo } from 'react'
import { useCalendar } from '../calendar/calendarContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import type { Dish } from '../dishes/types.ts'
import { addDays, localDate, type LocalDate } from '../lib/dates.ts'
import { useClock } from '../lib/clock.ts'
import { dishHistory } from '../plan/history.ts'
import { useMeals } from '../plan/mealContext.ts'
import { useStock } from '../stock/stockContext.ts'
import { balance, cookedMeals, GROUP_WEIGHT, nutrition, weekStart, WINDOW_DAYS, type Balance, type Gap, type Nutrition } from './balance.ts'
import { fills } from './swaps.ts'

/** "Short this fortnight" shows at most this many, each with a dish. */
export const IDEAS = 3

export interface FoodBalance {
  ready: boolean
  today: LocalDate
  week: Balance | null
  fortnight: Balance | null
  nutrition: Nutrition | null
  /** The biggest gaps with a dish that fills them (familiar ones, kids' favourites first). */
  ideas: { gap: Gap; dish: Dish }[]
}

/** This week and the last fortnight, group by group, with the gaps and a dish for each. */
export function useBalance(): FoodBalance {
  const clock = useClock()
  const today = localDate(clock())
  const { status: mealStatus, meals } = useMeals()
  const { status: dishStatus, dishes, dishesById } = useDishes()
  const { status: stockStatus, items } = useStock()
  const { status: calendarStatus, days } = useCalendar()
  const ready = mealStatus === 'ready' && dishStatus === 'ready' && stockStatus === 'ready' && calendarStatus === 'ready'

  return useMemo(() => {
    if (!ready) return { ready, today, week: null, fortnight: null, nutrition: null, ideas: [] }
    const itemsById = new Map(items.map((i) => [i.id, i]))
    const cooked = cookedMeals(meals, dishesById, itemsById)
    const n = nutrition(cooked, today, days)
    const history = dishHistory(meals)
    const familiar = (a: Dish, b: Dish) =>
      Number(b.is_kids_favourite) - Number(a.is_kids_favourite) ||
      Number(b.is_favourite) - Number(a.is_favourite) ||
      (history.get(b.id)?.timesCooked ?? 0) - (history.get(a.id)?.timesCooked ?? 0) ||
      a.name_en.localeCompare(b.name_en)
    const ideas = [...n.gaps]
      .sort((a, b) => b.size * GROUP_WEIGHT[b.group] - a.size * GROUP_WEIGHT[a.group])
      .map((gap) => ({
        gap,
        dish: dishes.filter((d) => !d.dont_suggest && d.type !== 'prepared' && fills([d], gap, n, itemsById)).sort(familiar)[0],
      }))
      // Only what can be acted on, and not too many: the group list shows the rest.
      .filter((x): x is { gap: Gap; dish: Dish } => x.dish !== undefined)
      .slice(0, IDEAS)
    return {
      ready,
      today,
      week: balance(cooked, weekStart(today), today),
      fortnight: balance(cooked, addDays(today, -(WINDOW_DAYS - 1)), today),
      nutrition: n,
      ideas,
    }
  }, [ready, today, meals, dishes, dishesById, items, days])
}
