import { useMemo, useState } from 'react'
import { Segmented } from '../components/Segmented.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { localDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { undoEvents } from './actions.ts'
import { computeStock } from './computeStock.ts'
import { defaultUnitFor, namesFromQuery, newItem, purchaseDefaults, purchaseEvent, type PurchaseForm } from './purchase.ts'
import { searchItems } from './search.ts'
import { useStock } from './stockContext.ts'
import { CATEGORIES, type BaseUnit, type Category, type EntryUnit, type Item } from './types.ts'
import { entryUnits, formatQuantity } from './units.ts'

const MAX_RESULTS = 8

const CATEGORY_LABELS: Record<Category, string> = {
  vegetable: 'Vegetable',
  greens: 'Greens',
  fruit: 'Fruit',
  meat: 'Meat',
  fish: 'Fish',
  egg: 'Eggs',
  dairy: 'Dairy',
  grain: 'Grains and rice',
  dal: 'Dals',
  spice: 'Spices',
  oil: 'Oils',
  other: 'Other',
}

const BASE_UNIT_OPTIONS: { value: BaseUnit; label: string }[] = [
  { value: 'g', label: 'g / kg' },
  { value: 'ml', label: 'ml / l' },
  { value: 'piece', label: 'Pieces' },
  { value: 'bunch', label: 'Bunches' },
  { value: 'packet', label: 'Packets' },
]

const ENTRY_UNIT_LABELS: Record<EntryUnit, string> = {
  kg: 'kg',
  g: 'g',
  l: 'l',
  ml: 'ml',
  piece: 'pieces',
  bunch: 'bunches',
  packet: 'packets',
}

const input = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3'
const primary = 'min-h-12 w-full rounded-xl bg-leaf font-semibold text-bg disabled:opacity-50'

type Stage = { kind: 'pick' } | { kind: 'new' } | { kind: 'amount'; item: Item }

interface Props {
  onClose: () => void
  /** Start with this search. */
  initialQuery?: string
  /** Go straight to making a new item (the search found nothing). */
  startNew?: boolean
}

/** Search for an item (or make one), then say how much was bought. */
export function AddStockSheet({ onClose, initialQuery = '', startNew = false }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [stage, setStage] = useState<Stage>({ kind: startNew ? 'new' : 'pick' })

  return (
    <Sheet title={stage.kind === 'new' ? 'New item' : 'Add stock'} onClose={onClose}>
      {stage.kind === 'pick' && (
        <PickItem
          query={query}
          onQuery={setQuery}
          onPick={(item) => setStage({ kind: 'amount', item })}
          onNew={() => setStage({ kind: 'new' })}
        />
      )}
      {stage.kind === 'new' && (
        <NewItemForm
          query={query}
          onBack={() => setStage({ kind: 'pick' })}
          onCreated={(item) => setStage({ kind: 'amount', item })}
        />
      )}
      {stage.kind === 'amount' && (
        <AmountForm item={stage.item} onBack={() => setStage({ kind: 'pick' })} onSaved={onClose} />
      )}
    </Sheet>
  )
}

function PickItem({
  query,
  onQuery,
  onPick,
  onNew,
}: {
  query: string
  onQuery: (q: string) => void
  onPick: (item: Item) => void
  onNew: () => void
}) {
  const { items, eventsByItem } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const results = useMemo(
    () =>
      searchItems(
        items.filter((i) => !i.archived),
        query,
      ).slice(0, MAX_RESULTS),
    [items, query],
  )
  const typed = query.trim() !== ''

  return (
    <div className="mt-4">
      <label className="block">
        <span className="text-sm font-medium">Item</span>
        <input
          data-autofocus
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search in Tamil or English"
          className={`mt-1 ${input}`}
        />
      </label>

      {typed && results.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Matching items">
          {results.map((item) => {
            const [first, second] = namePair(item, pref)
            const total = computeStock(item, eventsByItem.get(item.id) ?? []).total
            return (
              <li key={item.id}>
                <button type="button" onClick={() => onPick(item)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{first}</span>
                    <span className="block truncate text-sm text-ink-muted">{second}</span>
                  </span>
                  {total > 0 && <span className="shrink-0 text-sm text-ink-muted">Have {formatQuantity(total, item)}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {typed && results.length === 0 && <p className="mt-3 text-sm text-ink-muted">No items match "{query.trim()}".</p>}

      {typed && (
        <button
          type="button"
          onClick={onNew}
          className="mt-3 min-h-12 w-full rounded-xl border border-dashed border-leaf font-medium text-leaf"
        >
          Add new item
        </button>
      )}
    </div>
  )
}

function NewItemForm({ query, onBack, onCreated }: { query: string; onBack: () => void; onCreated: (item: Item) => void }) {
  const { addItem } = useStock()
  const prefill = namesFromQuery(query)
  const [nameTa, setNameTa] = useState(prefill.name_ta)
  const [nameEn, setNameEn] = useState(prefill.name_en)
  const [category, setCategory] = useState<Category>('vegetable')
  // Follows the category until chosen by hand.
  const [unit, setUnit] = useState<BaseUnit | null>(null)
  const chosenUnit = unit ?? defaultUnitFor(category)
  const ready = nameTa.trim() !== '' && nameEn.trim() !== ''

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        onCreated(addItem(newItem({ name_ta: nameTa, name_en: nameEn, category, unit: chosenUnit, query })))
      }}
    >
      <label className="block">
        <span className="text-sm font-medium">Tamil name</span>
        <input
          data-autofocus={prefill.name_ta ? undefined : true}
          lang="ta"
          value={nameTa}
          maxLength={80}
          onChange={(e) => setNameTa(e.target.value)}
          className={`mt-1 ${input}`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">English name</span>
        <input
          data-autofocus={prefill.name_ta ? true : undefined}
          value={nameEn}
          maxLength={80}
          onChange={(e) => setNameEn(e.target.value)}
          className={`mt-1 ${input}`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={`mt-1 ${input}`}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="text-sm font-medium">Counted in</span>
        <div className="mt-1">
          <Segmented label="Counted in" options={BASE_UNIT_OPTIONS} value={chosenUnit} onChange={setUnit} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">This can't be changed later.</p>
      </div>
      <div className="flex flex-col gap-2 pt-2">
        <button type="submit" disabled={!ready} className={primary}>
          Create item
        </button>
        <button type="button" onClick={onBack} className="min-h-12 rounded-xl font-medium">
          Back to search
        </button>
      </div>
    </form>
  )
}

function AmountForm({ item, onBack, onSaved }: { item: Item; onBack: () => void; onSaved: () => void }) {
  const { eventsByItem, record } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [form, setForm] = useState<PurchaseForm>(() => purchaseDefaults(item, localDate(new Date())))
  const event = purchaseEvent(item, form)
  const units = entryUnits(item)
  const [first, second] = namePair(item, pref)

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!event) return
        const before = eventsByItem.get(item.id) ?? []
        const added = record([event])
        const undo = undoEvents(item, before, added)
        toast(`${first}: ${formatQuantity(event.quantity, item)} added`, { undo: () => void record(undo) })
        onSaved()
      }}
    >
      <div className="flex items-center gap-3 rounded-xl bg-leaf-fill px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-leaf-strong">{first}</p>
          <p className="truncate text-sm text-leaf">{second}</p>
        </div>
        <button type="button" onClick={onBack} className="min-h-11 px-2 text-sm font-medium text-leaf-strong">
          Change
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Amount{units.length === 1 ? ` (${ENTRY_UNIT_LABELS[form.unit]})` : ''}</span>
        <input
          data-autofocus
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          onFocus={(e) => e.target.select()}
          className={`mt-1 ${input}`}
        />
      </label>
      {units.length > 1 && (
        <Segmented
          label="Unit"
          options={units.map((u) => ({ value: u, label: ENTRY_UNIT_LABELS[u] }))}
          value={form.unit}
          onChange={(unit) => setForm({ ...form, unit })}
        />
      )}
      <label className="block">
        <span className="text-sm font-medium">{item.shelf_life_days == null ? 'Use by (optional)' : 'Use by'}</span>
        <input
          type="date"
          value={form.expiresOn}
          onChange={(e) => setForm({ ...form, expiresOn: e.target.value })}
          className={`mt-1 ${input}`}
        />
      </label>

      <button type="submit" disabled={!event} className={primary}>
        {event ? `Add ${formatQuantity(event.quantity, item)}` : 'Enter an amount'}
      </button>
    </form>
  )
}
