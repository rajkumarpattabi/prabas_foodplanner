import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import type { Dish, Meal } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, type LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { undoAll } from '../stock/actions.ts'
import { primaryClass } from '../stock/labels.ts'
import { useStock } from '../stock/stockContext.ts'
import type { Combo } from './combos.ts'
import { cookEvents, cookLines, type CookLine } from './cook.ts'
import { useMeals } from './mealContext.ts'
import { StockLines } from './StockLines.tsx'
import { usePlanContext } from './usePlanContext.ts'

/** How long leftovers last by default: until the end of the day after the meal. */
export const LEFTOVER_DAYS = 1

interface Props {
  date: LocalDate
  meal: Meal
  combo: Combo
  onClose: () => void
}

/**
 * Cooking a meal: first the stock it takes, one line per item, each editable; then,
 * once confirmed, anything left over.
 */
export function CookSheet({ date, meal, combo, onClose }: Props) {
  const pref = useReadyHousehold().me.script_pref
  const [cooked, setCooked] = useState<{ mealId: string } | null>(null)
  const [first] = namePair(combo.main, pref)
  return (
    <Sheet title={cooked ? 'Anything left over?' : `Cook ${first}`} onClose={onClose}>
      {cooked ? (
        <Leftovers date={date} combo={combo} mealId={cooked.mealId} onDone={onClose} />
      ) : (
        <Deductions date={date} meal={meal} combo={combo} onCooked={(mealId) => setCooked({ mealId })} />
      )}
    </Sheet>
  )
}

function Deductions({ date, meal, combo, onCooked }: { date: LocalDate; meal: Meal; combo: Combo; onCooked: (mealId: string) => void }) {
  const { items, eventsByItem, record } = useStock()
  const { cookMeal, restoreMeal, setLeftoverEaten } = useMeals()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const ctx = usePlanContext(date)
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const [lines, setLines] = useState<CookLine[]>(() => cookLines(combo))
  const name = (d: Dish) => namePair(d, pref)[0]
  const leftoverDish = combo.leftover ? combo.sides.find((s) => s.id === combo.leftover!.dish_id) : undefined

  const confirm = () => {
    const events = cookEvents(lines, ctx.stockTotals)
    const added = record(events)
    const undoStock = undoAll(itemsById, eventsByItem, added)
    const before = cookMeal(date, meal, combo)
    const leftover = combo.leftover
    if (leftover) setLeftoverEaten(leftover.id, true)
    toast(`${name(combo.main)} cooked${added.length ? ' · stock updated' : ''}`, {
      undo: () => {
        record(undoStock)
        restoreMeal(date, meal, before)
        if (leftover) setLeftoverEaten(leftover.id, false)
      },
    })
    onCooked(`${combo.main.household_id}:${date}:${meal}`)
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-ink-muted">
        {[combo.main, ...(combo.base ? [combo.base] : []), ...combo.sides].map(name).join(' · ')}
      </p>
      {leftoverDish && <p className="mt-1 text-sm text-teal">Uses the leftover {name(leftoverDish)}: nothing to take for it.</p>}

      <h3 className="mt-4 text-sm font-semibold text-ink-muted">Take from stock, for 5</h3>
      <StockLines lines={lines} onChange={setLines} itemsById={itemsById} stockTotals={ctx.stockTotals} pref={pref} label="Take from stock" />

      <button type="button" onClick={confirm} className={`mt-5 ${primaryClass}`}>
        Cooked · take from stock
      </button>
    </div>
  )
}

function Leftovers({ date, combo, mealId, onDone }: { date: LocalDate; combo: Combo; mealId: string; onDone: () => void }) {
  const { addLeftovers } = useMeals()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  // Everything cooked just now (not a leftover that was finished).
  const dishes = [combo.main, ...(combo.base ? [combo.base] : []), ...combo.sides.filter((s) => s.id !== combo.leftover?.dish_id)]
  const [servings, setServings] = useState<Record<string, number>>({})
  const any = Object.values(servings).some((n) => n > 0)

  const save = () => {
    const expires_on = addDays(date, LEFTOVER_DAYS)
    const added = addLeftovers(
      dishes.filter((d) => (servings[d.id] ?? 0) > 0).map((d) => ({ dish: d, servings: servings[d.id], expires_on, meal_id: mealId })),
    )
    toast(`${added.length} ${added.length === 1 ? 'leftover' : 'leftovers'} saved`)
    onDone()
  }

  return (
    <div className="mt-2">
      <p className="text-sm text-ink-muted">They'll show under Ready to eat on the Stock tab, and in suggestions, until the end of the next day.</p>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Leftovers">
        {dishes.map((d) => {
          const [first] = namePair(d, pref)
          const n = servings[d.id] ?? 0
          return (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{first}</span>
              <button
                type="button"
                aria-label={`Fewer servings of ${first}`}
                disabled={n === 0}
                onClick={() => setServings((s) => ({ ...s, [d.id]: n - 1 }))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-xl disabled:opacity-40"
              >
                −
              </button>
              <span className="w-16 text-center text-sm" aria-live="polite">
                {n === 0 ? 'None' : `${n} ${n === 1 ? 'serving' : 'servings'}`}
              </span>
              <button
                type="button"
                aria-label={`More servings of ${first}`}
                onClick={() => setServings((s) => ({ ...s, [d.id]: n + 1 }))}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-leaf-fill text-xl text-leaf-strong"
              >
                +
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" disabled={!any} onClick={save} className={primaryClass}>
          Save leftovers
        </button>
        <button data-autofocus type="button" onClick={onDone} className="min-h-12 w-full rounded-xl font-medium">
          No leftovers
        </button>
      </div>
    </div>
  )
}
