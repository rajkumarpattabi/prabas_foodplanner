import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import type { Dish, Meal } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, type LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { undoAll } from '../stock/actions.ts'
import { AmountFields } from '../stock/fields.tsx'
import { primaryClass } from '../stock/labels.ts'
import { amountToBase } from '../stock/purchase.ts'
import { useStock } from '../stock/stockContext.ts'
import type { Item } from '../stock/types.ts'
import { entryUnits, formatQuantity, fromBase } from '../stock/units.ts'
import type { Combo } from './combos.ts'
import { cookEvents, cookLines, type CookLine } from './cook.ts'
import { useMeals } from './mealContext.ts'
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
  const [editing, setEditing] = useState<string | null>(null)
  const name = (d: Dish) => namePair(d, pref)[0]
  const leftoverDish = combo.leftover ? combo.sides.find((s) => s.id === combo.leftover!.dish_id) : undefined
  const setLine = (itemId: string, patch: Partial<CookLine>) => setLines((ls) => ls.map((l) => (l.item_id === itemId ? { ...l, ...patch } : l)))

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
      {lines.length ? (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label="Take from stock">
          {lines.map((line) => {
            const item = itemsById.get(line.item_id)
            if (!item) return null
            const itemName = namePair(item, pref)[0]
            const have = ctx.stockTotals.get(item.id) ?? 0
            const short = line.include && have < line.quantity
            return (
              <li key={line.item_id} className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Take ${itemName}`}
                    checked={line.include}
                    onChange={(e) => setLine(line.item_id, { include: e.target.checked })}
                    className="h-5 w-5 shrink-0 accent-leaf"
                  />
                  <span className={`min-w-0 flex-1 truncate ${line.include ? '' : 'text-ink-muted line-through'}`}>{itemName}</span>
                  <button
                    type="button"
                    aria-label={`Change amount of ${itemName}`}
                    onClick={() => setEditing(editing === line.item_id ? null : line.item_id)}
                    className="min-h-11 shrink-0 rounded-lg px-2 font-medium underline decoration-dotted"
                  >
                    {formatQuantity(line.quantity, item)}
                  </button>
                </div>
                {short && (
                  <p className="ml-8 text-xs text-turmeric-strong">
                    {have > 0 ? `Only ${formatQuantity(have, item)} in stock: that's what will be taken` : 'None in stock: nothing will be taken'}
                  </p>
                )}
                {line.optional && !line.include && <p className="ml-8 text-xs text-ink-muted">Optional</p>}
                {editing === line.item_id && (
                  <LineAmount
                    quantity={line.quantity}
                    item={item}
                    onDone={(quantity) => {
                      setLine(line.item_id, { quantity, include: quantity > 0 })
                      setEditing(null)
                    }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">Nothing to take from stock.</p>
      )}

      <button type="button" onClick={confirm} className={`mt-5 ${primaryClass}`}>
        Cooked · take from stock
      </button>
    </div>
  )
}

function LineAmount({ quantity, item, onDone }: { quantity: number; item: Item; onDone: (quantity: number) => void }) {
  const [fields, setFields] = useState({ amount: String(fromBase(quantity, item.display_unit, item) ?? quantity), unit: item.display_unit })
  const next = amountToBase(fields.amount, fields.unit, item, { allowZero: true })
  return (
    <div className="ml-8 mt-2 space-y-2">
      <AmountFields label="Amount" amount={fields.amount} unit={fields.unit} units={entryUnits(item)} onChange={setFields} />
      <button
        type="button"
        disabled={next === null}
        onClick={() => next !== null && onDone(next)}
        className="min-h-11 w-full rounded-xl border border-line font-medium disabled:opacity-50"
      >
        {next === null ? 'Enter an amount' : `Use ${formatQuantity(next, item)}`}
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
