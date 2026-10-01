import { useMemo } from 'react'
import type { LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { useBatches } from '../prepared/batchContext.ts'
import { batchState } from '../prepared/batchState.ts'
import { readyPrepared } from '../prepared/ready.ts'
import { useNow } from '../prepared/useNow.ts'
import { useStock } from '../stock/stockContext.ts'
import { stockRows } from '../stock/view.ts'
import { dishHistory } from './history.ts'
import { useMeals } from './mealContext.ts'
import type { PlanContext } from './score.ts'

/**
 * What scoring needs to know, from stock, cooking history, what's made ahead and
 * ready, the calendar (is it a non-veg day), and the person's script choice.
 */
export function usePlanContext(today: LocalDate, nonVegDay = false): PlanContext {
  const { items, eventsByItem } = useStock()
  const { meals } = useMeals()
  const pref = useReadyHousehold().me.script_pref
  const { dishesById } = useDishes()
  const { batches, events } = useBatches()
  const now = useNow()
  const prepared = useMemo(() => readyPrepared(batches.map((b) => batchState(b, events, now)), now), [batches, events, now])
  return useMemo(() => {
    const rows = stockRows(items, eventsByItem)
    return {
      today,
      itemsById: new Map(items.map((i) => [i.id, i])),
      stockTotals: new Map(rows.map((r) => [r.item.id, r.stock.total])),
      // The Stock screen's "Use soon": the same rule decides what to use first.
      urgentItemIds: new Set(rows.filter((r) => r.urgency.group === 'use_soon' && r.stock.total > 0).map((r) => r.item.id)),
      trackedItemIds: new Set(rows.filter((r) => r.events.length > 0).map((r) => r.item.id)),
      nonVegDay,
      history: dishHistory(meals),
      itemName: (i) => namePair(i, pref)[0],
      dishName: (d) => namePair(d, pref)[0],
      prepared,
      dishesById,
    }
  }, [items, eventsByItem, meals, pref, today, nonVegDay, prepared, dishesById])
}
