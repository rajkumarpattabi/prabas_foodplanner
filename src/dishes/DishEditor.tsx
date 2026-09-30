import { useMemo, useState } from 'react'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { AmountFields, Check, TextField, ToggleChip } from '../stock/fields.tsx'
import { inputClass, primaryClass } from '../stock/labels.ts'
import { amountToBase } from '../stock/purchase.ts'
import { searchItems } from '../stock/search.ts'
import { useStock } from '../stock/stockContext.ts'
import type { EntryUnit, Item } from '../stock/types.ts'
import { entryUnits, formatQuantity, fromBase } from '../stock/units.ts'
import { VegLabel } from './DishBits.tsx'
import { useDishes } from './dishContext.ts'
import { dishForm, dishPatch, EMPTY_DISH_FORM, newDishFrom, reverseDishPatch, toggle, type DishForm } from './dishEdit.ts'
import { MEAL_LABELS, TAG_LABELS, TYPE_LABELS } from './labels.ts'
import { addSide, isSideType, isVeg, moveSide, removeIngredient, removeSide, setIngredient } from './rules.ts'
import { DISH_TAGS, DISH_TYPES, MEALS, type Dish, type DishType, type Ingredient } from './types.ts'

const MAX_RESULTS = 20
const secondary = 'min-h-12 w-full rounded-xl border border-dashed border-leaf font-medium text-leaf'
const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted disabled:opacity-30'

type View =
  | { kind: 'form' }
  | { kind: 'pickItem' }
  | { kind: 'amount'; itemId: string }
  | { kind: 'pickSide' }
  | { kind: 'confirmDelete' }

interface Props {
  /** The dish to edit; none to add a new one. */
  dish?: Dish
  /** After saving: the new dish, or the edited one. */
  onSaved: (dish: Dish) => void
  onCancel: () => void
  onDeleted?: () => void
}

/** Add or edit a dish: names, type, meals, tags, ingredients for five, and ranked sides. */
export function DishEditor({ dish, onSaved, onCancel, onDeleted }: Props) {
  const { addDish, updateDish, deleteDish } = useDishes()
  const { status: stockStatus, items } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [form, setForm] = useState<DishForm>(() => (dish ? dishForm(dish) : EMPTY_DISH_FORM))
  const [view, setView] = useState<View>({ kind: 'form' })
  const [error, setError] = useState<string | null>(null)
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const set = (patch: Partial<DishForm>) => setForm((f) => ({ ...f, ...patch }))
  const back = () => setView({ kind: 'form' })
  const name = dish ? namePair(dish, pref)[0] : ''

  const save = () => {
    if (dish) {
      const result = dishPatch(dish, form)
      if ('error' in result) return setError(result.error)
      if (Object.keys(result.patch).length) {
        const undo = reverseDishPatch(dish, result.patch)
        updateDish(dish.id, result.patch)
        toast(`${name} saved`, { undo: () => updateDish(dish.id, undo) })
      }
      onSaved(dish)
    } else {
      const result = newDishFrom(form)
      if ('error' in result) return setError(result.error)
      const added = addDish(result.dish)
      toast(`${namePair(added, pref)[0]} added`, { undo: () => deleteDish(added.id) })
      onSaved(added)
    }
  }

  if (view.kind === 'pickItem') {
    return (
      <PickItem
        exclude={new Set(form.ingredients.map((i) => i.item_id))}
        onPick={(item) => setView({ kind: 'amount', itemId: item.id })}
        onBack={back}
      />
    )
  }
  if (view.kind === 'amount') {
    const item = itemsById.get(view.itemId)
    if (!item) return null
    return (
      <IngredientAmount
        item={item}
        initial={form.ingredients.find((i) => i.item_id === item.id)}
        onDone={(ingredient) => {
          set({ ingredients: setIngredient(form.ingredients, ingredient) })
          back()
        }}
        onRemove={() => {
          set({ ingredients: removeIngredient(form.ingredients, item.id) })
          back()
        }}
        onBack={back}
      />
    )
  }
  if (view.kind === 'pickSide') {
    return (
      <PickSide
        exclude={new Set([...(dish ? [dish.id] : []), ...form.side_ids])}
        onPick={(side) => {
          set({ side_ids: addSide(form.side_ids, dish?.id ?? '', side.id) })
          back()
        }}
        onBack={back}
      />
    )
  }
  if (view.kind === 'confirmDelete' && dish) {
    return (
      <div className="mt-2">
        <p className="text-sm text-ink-muted">
          Delete {name} for everyone? It's also taken out of other dishes' sides. This can't be undone, except by restoring a backup.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              deleteDish(dish.id)
              toast(`${name} deleted`)
              onDeleted?.()
            }}
            className="min-h-12 rounded-xl bg-red font-semibold text-surface"
          >
            Delete dish
          </button>
          <button data-autofocus type="button" onClick={back} className="min-h-12 rounded-xl font-medium">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <TextField label="Tamil name" value={form.name_ta} onChange={(v) => set({ name_ta: v })} lang="ta" />
      <TextField label="English name" value={form.name_en} onChange={(v) => set({ name_en: v })} />
      <TextField
        label="Other names"
        hint="Other spellings people type, like poondu kulambu. Separate with commas."
        value={form.aliases}
        onChange={(v) => set({ aliases: v })}
      />
      <label className="block">
        <span className="text-sm font-medium">Type</span>
        <select value={form.type} onChange={(e) => set({ type: e.target.value as DishType })} className={`mt-1 ${inputClass}`}>
          {DISH_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Meals</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <ToggleChip key={m} pressed={form.meals.includes(m)} onClick={() => set({ meals: toggle(form.meals, m, MEALS) })}>
              {MEAL_LABELS[m]}
            </ToggleChip>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Tags</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DISH_TAGS.map((t) => (
            <ToggleChip key={t} pressed={form.tags.includes(t)} onClick={() => set({ tags: toggle(form.tags, t, DISH_TAGS) })}>
              {TAG_LABELS[t]}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Ingredients for 5</h3>
          <span className="flex items-center gap-2 text-xs text-ink-muted">
            From the ingredients: <VegLabel isVeg={isVeg(form.ingredients, itemsById)} />
          </span>
        </div>
        {form.ingredients.length > 0 && (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label="Ingredients">
            {form.ingredients.map((ing) => {
              const item = itemsById.get(ing.item_id)
              const itemName = item ? namePair(item, pref)[0] : stockStatus === 'ready' ? 'An item no longer in your list' : 'Loading…'
              return (
                <li key={ing.item_id} className="flex items-center gap-2 pl-3">
                  <button
                    type="button"
                    disabled={!item}
                    onClick={() => setView({ kind: 'amount', itemId: ing.item_id })}
                    className="min-h-12 min-w-0 flex-1 py-1 text-left"
                  >
                    <span className="block truncate">{itemName}</span>
                    <span className="block text-sm text-ink-muted">
                      {item ? formatQuantity(ing.quantity, item) : ''}
                      {ing.optional ? ' · optional' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${itemName}`}
                    onClick={() => set({ ingredients: removeIngredient(form.ingredients, ing.item_id) })}
                    className={iconButton}
                  >
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button type="button" onClick={() => setView({ kind: 'pickItem' })} className={`mt-2 ${secondary}`}>
          + Add ingredient
        </button>
      </section>

      <section>
        <h3 className="text-sm font-medium">Goes with (best first)</h3>
        {form.side_ids.length > 0 && <SideList sides={form.side_ids} onChange={(side_ids) => set({ side_ids })} />}
        <button type="button" onClick={() => setView({ kind: 'pickSide' })} className={`mt-2 ${secondary}`}>
          + Add side
        </button>
      </section>

      <label className="block">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          value={form.notes}
          maxLength={1000}
          rows={3}
          onChange={(e) => set({ notes: e.target.value })}
          className={`mt-1 ${inputClass} py-2`}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-fill px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      <button type="submit" className={primaryClass}>
        {dish ? 'Save' : 'Add dish'}
      </button>
      <button type="button" onClick={onCancel} className="min-h-12 w-full rounded-xl font-medium">
        Cancel
      </button>
      {dish && (
        <button type="button" onClick={() => setView({ kind: 'confirmDelete' })} className="min-h-12 w-full rounded-xl font-medium text-red">
          Delete dish
        </button>
      )}
    </form>
  )
}

/** Ranked sides, each movable up and down, or removable. */
function SideList({ sides, onChange }: { sides: string[]; onChange: (sides: string[]) => void }) {
  const { dishesById } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  const shown = sides.filter((id) => dishesById.has(id))
  return (
    <ol className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label="Sides">
      {shown.map((id, i) => {
        const [first] = namePair(dishesById.get(id)!, pref)
        return (
          <li key={id} className="flex items-center gap-1 pl-3">
            <span aria-hidden="true" className="w-4 text-sm font-semibold text-teal">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate py-3">{first}</span>
            <button type="button" aria-label={`Move ${first} up`} disabled={i === 0} onClick={() => onChange(moveSide(sides, id, -1))} className={iconButton}>
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${first} down`}
              disabled={i === shown.length - 1}
              onClick={() => onChange(moveSide(sides, id, 1))}
              className={iconButton}
            >
              ↓
            </button>
            <button type="button" aria-label={`Remove ${first}`} onClick={() => onChange(removeSide(sides, id))} className={iconButton}>
              ✕
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function PickItem({ exclude, onPick, onBack }: { exclude: ReadonlySet<string>; onPick: (item: Item) => void; onBack: () => void }) {
  const { items } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const [query, setQuery] = useState('')
  const results = useMemo(
    () =>
      searchItems(
        items.filter((i) => !i.archived && !exclude.has(i.id)),
        query,
      ).slice(0, MAX_RESULTS),
    [items, exclude, query],
  )
  return (
    <div className="mt-4">
      <label className="block">
        <span className="text-sm font-medium">Ingredient</span>
        <input
          data-autofocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in Tamil or English"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Matching items">
          {results.map((item) => {
            const [first, second] = namePair(item, pref)
            return (
              <li key={item.id}>
                <button type="button" onClick={() => onPick(item)} className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left">
                  <span className="truncate font-medium">{first}</span>
                  <span className="truncate text-sm text-ink-muted">{second}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim() && !results.length && (
        <p className="mt-3 text-sm text-ink-muted">No items match. New items can be added on the Stock tab.</p>
      )}
      <button type="button" onClick={onBack} className="mt-3 min-h-12 w-full rounded-xl font-medium">
        Back
      </button>
    </div>
  )
}

const amountText = (quantity: number, unit: EntryUnit, item: Item) => String(fromBase(quantity, unit, item) ?? quantity)

function IngredientAmount({
  item,
  initial,
  onDone,
  onRemove,
  onBack,
}: {
  item: Item
  initial?: Ingredient
  onDone: (ingredient: Ingredient) => void
  onRemove: () => void
  onBack: () => void
}) {
  const pref = useReadyHousehold().me.script_pref
  const [fields, setFields] = useState({ amount: amountText(initial?.quantity ?? item.step, item.display_unit, item), unit: item.display_unit })
  const [optional, setOptional] = useState(initial?.optional ?? false)
  const quantity = amountToBase(fields.amount, fields.unit, item)
  const [first, second] = namePair(item, pref)
  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (quantity) onDone(optional ? { item_id: item.id, quantity, optional: true } : { item_id: item.id, quantity })
      }}
    >
      <div className="rounded-xl bg-leaf-fill px-3 py-2">
        <p className="font-medium text-leaf-strong">{first}</p>
        <p className="text-sm text-leaf">{second}</p>
      </div>
      <AmountFields label="Amount for 5" amount={fields.amount} unit={fields.unit} units={entryUnits(item)} onChange={setFields} />
      <Check label="Optional (not needed to cook it)" checked={optional} onChange={setOptional} />
      <button type="submit" disabled={!quantity} className={primaryClass}>
        {quantity ? `${initial ? 'Set' : 'Add'} ${formatQuantity(quantity, item)}` : 'Enter an amount'}
      </button>
      {initial && (
        <button type="button" onClick={onRemove} className="min-h-12 w-full rounded-xl font-medium text-red">
          Remove from this dish
        </button>
      )}
      <button type="button" onClick={onBack} className="min-h-12 w-full rounded-xl font-medium">
        Back
      </button>
    </form>
  )
}

function PickSide({ exclude, onPick, onBack }: { exclude: ReadonlySet<string>; onPick: (dish: Dish) => void; onBack: () => void }) {
  const { dishes } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const open = dishes.filter((d) => !exclude.has(d.id))
    // With nothing typed, offer the usual sides: sambar, chutney, poriyal…
    return (query.trim() ? searchItems(open, query) : open.filter((d) => isSideType(d.type)).sort((a, b) => a.name_en.localeCompare(b.name_en))).slice(
      0,
      MAX_RESULTS,
    )
  }, [dishes, exclude, query])
  return (
    <div className="mt-4">
      <label className="block">
        <span className="text-sm font-medium">Side</span>
        <input
          data-autofocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in Tamil or English"
          className={`mt-1 ${inputClass}`}
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Matching dishes">
          {results.map((d) => {
            const [first, second] = namePair(d, pref)
            return (
              <li key={d.id}>
                <button type="button" onClick={() => onPick(d)} className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left">
                  <span className="truncate font-medium">{first}</span>
                  <span className="truncate text-sm text-ink-muted">
                    {second} · {TYPE_LABELS[d.type]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {query.trim() && !results.length && <p className="mt-3 text-sm text-ink-muted">No dishes match.</p>}
      <button type="button" onClick={onBack} className="mt-3 min-h-12 w-full rounded-xl font-medium">
        Back
      </button>
    </div>
  )
}
