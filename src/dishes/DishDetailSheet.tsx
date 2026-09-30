import { useMemo, useState } from 'react'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { useStock } from '../stock/stockContext.ts'
import { formatQuantity } from '../stock/units.ts'
import { DishBadges, DishIcon } from './DishBits.tsx'
import { useDishes, type DishPatch } from './dishContext.ts'
import { ingredientLines, type Availability } from './ingredients.ts'
import { MEAL_LABELS, TAG_LABELS, TYPE_LABELS } from './labels.ts'
import type { Dish } from './types.ts'

const AVAILABILITY: Record<Availability, { label: string; className: string }> = {
  enough: { label: 'In stock', className: 'bg-leaf-fill text-leaf-strong' },
  some: { label: 'Some in stock', className: 'bg-turmeric-fill text-turmeric-strong' },
  none: { label: 'Not in stock', className: 'text-ink-muted' },
}

type Flag = 'is_favourite' | 'is_kids_favourite' | 'dont_suggest'

const FLAGS: { key: Flag; label: string; on: string; off: string }[] = [
  { key: 'is_favourite', label: 'Favourite', on: 'marked as a favourite', off: 'no longer a favourite' },
  { key: 'is_kids_favourite', label: "Kids' favourite", on: "marked as a kids' favourite", off: "no longer a kids' favourite" },
  { key: 'dont_suggest', label: "Don't suggest", on: "won't be suggested", off: 'will be suggested again' },
]

interface Props {
  dishId: string
  onClose: () => void
}

/**
 * One dish: what goes with it, what's in it (for five), and its flags. Tapping a side
 * opens that dish here, with a way back.
 */
export function DishDetailSheet({ dishId, onClose }: Props) {
  const { dishesById } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  // The dishes opened here, most recent last, for Back.
  const [trail, setTrail] = useState([dishId])
  const dish = dishesById.get(trail.at(-1)!)
  const previous = trail.length > 1 ? dishesById.get(trail.at(-2)!) : undefined
  if (!dish) return null
  const [first] = namePair(dish, pref)

  return (
    <Sheet title={first} onClose={onClose}>
      {previous && (
        <button type="button" onClick={() => setTrail((t) => t.slice(0, -1))} className="-mt-1 mb-1 min-h-11 text-sm font-medium text-leaf">
          ← Back to {namePair(previous, pref)[0]}
        </button>
      )}
      <DishDetail key={dish.id} dish={dish} onOpen={(id) => setTrail((t) => [...t, id])} />
    </Sheet>
  )
}

function DishDetail({ dish, onOpen }: { dish: Dish; onOpen: (id: string) => void }) {
  const { dishesById, updateDish } = useDishes()
  const { status: stockStatus, items, eventsByItem } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [first, second] = namePair(dish, pref)
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const lines = useMemo(() => ingredientLines(dish.ingredients, itemsById, eventsByItem), [dish.ingredients, itemsById, eventsByItem])
  const sides = dish.side_ids.map((id) => dishesById.get(id)).filter((d): d is Dish => d !== undefined)

  const setFlag = (key: Flag, value: boolean) => {
    const flag = FLAGS.find((f) => f.key === key)!
    updateDish(dish.id, { [key]: value } as DishPatch)
    toast(`${first} ${value ? flag.on : flag.off}`, { undo: () => updateDish(dish.id, { [key]: !value } as DishPatch) })
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-3">
        <DishIcon type={dish.type} size="lg" />
        <div className="min-w-0">
          <p className="text-ink-muted">{second}</p>
          <p className="text-sm text-ink-muted">
            {TYPE_LABELS[dish.type]}
            {dish.meals.length > 0 && ` · ${dish.meals.map((m) => MEAL_LABELS[m]).join(', ')}`}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <DishBadges dish={dish} />
      </div>

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-ink-muted">Goes with</h3>
        {sides.length ? (
          <ol className="mt-2 divide-y divide-line rounded-xl border border-line">
            {sides.map((s, i) => {
              const [sideFirst, sideSecond] = namePair(s, pref)
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => onOpen(s.id)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
                    <span aria-hidden="true" className="w-4 text-sm font-semibold text-teal">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{sideFirst}</span>
                      <span className="block truncate text-sm text-ink-muted">{sideSecond}</span>
                    </span>
                    <span aria-hidden="true" className="text-ink-muted">
                      ›
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">No sides yet.</p>
        )}
      </section>

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-ink-muted">Ingredients for 5</h3>
        {stockStatus !== 'ready' && lines.length ? (
          <p className="mt-1 text-sm text-ink-muted">Loading ingredients…</p>
        ) : lines.length ? (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label="Ingredients">
            {lines.map(({ ingredient, item, availability }) => {
              const a = AVAILABILITY[availability]
              return (
                <li key={ingredient.item_id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item ? namePair(item, pref)[0] : 'An item no longer in your list'}</span>
                    <span className="block text-sm text-ink-muted">
                      {item ? formatQuantity(ingredient.quantity, item) : ''}
                      {ingredient.optional ? `${item ? ' · ' : ''}optional` : ''}
                    </span>
                  </span>
                  {item && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${a.className}`}>{a.label}</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">No ingredients yet.</p>
        )}
      </section>

      {dish.tags.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-ink-muted">Tags</h3>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {dish.tags.map((t) => (
              <span key={t} className="rounded-full border border-line px-2 py-0.5 text-xs font-medium">
                {TAG_LABELS[t]}
              </span>
            ))}
          </p>
        </section>
      )}

      {dish.notes && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-ink-muted">Notes</h3>
          <p className="mt-1 whitespace-pre-line text-sm">{dish.notes}</p>
        </section>
      )}

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-ink-muted">Cooking history</h3>
        <p className="mt-1 text-sm text-ink-muted">Not cooked yet</p>
      </section>

      <section className="mt-5 divide-y divide-line rounded-xl border border-line">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex min-h-12 items-center justify-between gap-3 px-3">
            <span className="font-medium">{f.label}</span>
            <input
              type="checkbox"
              role="switch"
              checked={dish[f.key]}
              onChange={(e) => setFlag(f.key, e.target.checked)}
              className="h-6 w-6 accent-leaf"
            />
          </label>
        ))}
      </section>
    </div>
  )
}
