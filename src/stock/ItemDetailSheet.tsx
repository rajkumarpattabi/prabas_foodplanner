import { useMemo, useState } from 'react'
import { Segmented } from '../components/Segmented.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { attribution, relTime } from '../lib/time.ts'
import { correctEvents, expiryEvents, openEvents, spoiledEvents } from './actions.ts'
import { BoughtForm } from './AddStockSheet.tsx'
import type { Batch } from './computeStock.ts'
import { AmountFields, Check, TextField } from './fields.tsx'
import { describeEvent, newestFirst } from './history.ts'
import { displayUnits, itemForm, itemPatch, reversePatch, type ItemForm } from './itemEdit.ts'
import { CATEGORY_LABELS, ENTRY_UNIT_LABELS, inputClass, primaryClass } from './labels.ts'
import { amountToBase } from './purchase.ts'
import { useStock } from './stockContext.ts'
import { CATEGORIES, type Category, type EntryUnit, type Form, type Item } from './types.ts'
import { entryUnits, formatQuantity, fromBase } from './units.ts'
import { UrgencyChip } from './UrgencyChip.tsx'
import { useStockAction } from './useStockAction.ts'
import { stockRow, type StockRow } from './view.ts'

const HISTORY_SHOWN = 10

type Stage = 'main' | 'bought' | 'correct' | 'spoiled' | 'edit'

const secondary = 'min-h-12 rounded-xl border border-line bg-surface font-medium disabled:opacity-40'

interface Props {
  itemId: string
  onClose: () => void
}

/** One item: what's there by purchase, what happened to it, and everything you can do with it. */
export function ItemDetailSheet({ itemId, onClose }: Props) {
  const { items, eventsByItem } = useStock()
  const pref = useReadyHousehold().me.script_pref
  const [stage, setStage] = useState<Stage>('main')
  const item = items.find((i) => i.id === itemId)
  const events = eventsByItem.get(itemId)
  const row = useMemo(() => (item ? stockRow(item, events ?? []) : null), [item, events])
  if (!item || !row) return null
  const [first, second] = namePair(item, pref)
  const back = () => setStage('main')

  const titles: Record<Stage, string> = {
    main: first,
    bought: `Bought ${first}`,
    correct: `Correct ${first}`,
    spoiled: `Spoiled ${first}`,
    edit: `Edit ${first}`,
  }

  return (
    <Sheet title={titles[stage]} onClose={onClose}>
      {stage === 'main' && <Main row={row} second={second} name={first} onStage={setStage} />}
      {stage === 'bought' && (
        <>
          <BoughtForm item={item} onSaved={back} />
          <BackButton onClick={back} />
        </>
      )}
      {stage === 'correct' && <CorrectForm row={row} name={first} onDone={back} />}
      {stage === 'spoiled' && <SpoiledForm row={row} name={first} onDone={back} />}
      {stage === 'edit' && <EditForm item={item} name={first} onDone={back} onRemoved={onClose} />}
    </Sheet>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 min-h-12 w-full rounded-xl font-medium">
      Back
    </button>
  )
}

function Main({ row, name, second, onStage }: { row: StockRow; name: string; second: string; onStage: (s: Stage) => void }) {
  const { item, stock, urgency, events } = row
  const { me, members } = useReadyHousehold()
  const act = useStockAction()
  const [showAll, setShowAll] = useState(false)
  const names = useMemo(() => new Map(members.map((m) => [m.userId, m.profile?.display_name ?? ''])), [members])
  const history = newestFirst(events)
  const shown = showAll ? history : history.slice(0, HISTORY_SHOWN)
  const who = (by: string | null, at: string) => attribution({ by, at, me: me.user_id, names })
  const canOpen = openEvents(item, stock).length > 0

  return (
    <div className="mt-1">
      <p className="text-sm text-ink-muted">{second}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-lg font-medium">{stock.total > 0 ? formatQuantity(stock.total, item) : 'None'}</span>
        <UrgencyChip level={urgency.level} label={urgency.label} />
      </div>
      {stock.lastEvent && (
        <p className="mt-1 text-xs text-ink-muted">{who(stock.lastEvent.created_by, stock.lastEvent.occurred_at)}</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={secondary} onClick={() => onStage('bought')}>
          Bought…
        </button>
        <button type="button" className={secondary} onClick={() => onStage('correct')}>
          Correct to…
        </button>
        <button type="button" className={secondary} disabled={stock.total <= 0} onClick={() => onStage('spoiled')}>
          Spoiled…
        </button>
        {item.has_opened_form && (
          <button
            type="button"
            className={secondary}
            disabled={!canOpen}
            onClick={() => act(item, openEvents(item, stock), () => `${name}: opened one`)}
          >
            Open one
          </button>
        )}
        <button type="button" className={secondary} onClick={() => onStage('edit')}>
          Edit item
        </button>
      </div>

      {stock.batches.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-ink-muted">Purchases</h3>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {stock.batches.map((b) => (
              <BatchRow
                key={b.id}
                batch={b}
                item={item}
                onDate={(date) => act(item, expiryEvents(item, b.id, date), () => `${name}: use-by date changed`)}
              />
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-ink-muted">History</h3>
          <ul className="mt-2 space-y-3" aria-label="History">
            {shown.map((e) => (
              <li key={e.id}>
                <p className="text-sm">{describeEvent(e, item)}</p>
                <p className="text-xs text-ink-muted">{who(e.created_by, e.occurred_at)}</p>
              </li>
            ))}
          </ul>
          {history.length > HISTORY_SHOWN && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-11 text-sm font-medium text-leaf">
              {showAll ? 'Show fewer' : `Show all ${history.length}`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}

function BatchRow({ batch, item, onDate }: { batch: Batch; item: Item; onDate: (date: string) => void }) {
  const amount = `${formatQuantity(batch.remaining, item)}${batch.form === 'opened' ? ' opened' : ''}`
  const added = relTime(batch.addedAt)
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{amount}</p>
        <p className="text-xs text-ink-muted">Added {added}</p>
      </div>
      {batch.expiresOn ? (
        <input
          type="date"
          aria-label={`Use by, for ${amount} added ${added}`}
          value={batch.expiresOn}
          onChange={(e) => e.target.value && e.target.value !== batch.expiresOn && onDate(e.target.value)}
          className="min-h-11 rounded-xl border border-line bg-bg px-2 text-sm"
        />
      ) : (
        <span className="text-sm text-ink-muted">Keeps</span>
      )}
    </li>
  )
}

/** Whole or opened, for coconuts and the like. */
function FormPicker({ value, onChange }: { value: Form; onChange: (f: Form) => void }) {
  return (
    <Segmented
      label="Which"
      options={[
        { value: 'whole', label: 'Whole' },
        { value: 'opened', label: 'Opened' },
      ]}
      value={value}
      onChange={onChange}
    />
  )
}

/** Amount text for a base-unit quantity, in the unit shown. */
const amountText = (quantity: number, unit: EntryUnit, item: Item) => String(fromBase(quantity, unit, item) ?? quantity)

function CorrectForm({ row, name, onDone }: { row: StockRow; name: string; onDone: () => void }) {
  const { item, stock } = row
  const act = useStockAction()
  const [form, setForm] = useState<Form>('whole')
  const have = (f: Form) => (f === 'opened' ? stock.opened : stock.whole)
  const [fields, setFields] = useState({ amount: amountText(have('whole'), item.display_unit, item), unit: item.display_unit })
  const quantity = amountToBase(fields.amount, fields.unit, item, { allowZero: true })

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (quantity === null) return
        act(item, correctEvents(item, quantity, form), (t) => `${name}: ${t}`)
        onDone()
      }}
    >
      <p className="text-sm text-ink-muted">Set how much there really is now.</p>
      {item.has_opened_form && (
        <FormPicker
          value={form}
          onChange={(f) => {
            setForm(f)
            setFields({ ...fields, amount: amountText(have(f), fields.unit, item) })
          }}
        />
      )}
      <AmountFields label="There is now" amount={fields.amount} unit={fields.unit} units={entryUnits(item)} onChange={setFields} />
      <button type="submit" disabled={quantity === null} className={primaryClass}>
        {quantity === null ? 'Enter an amount' : `Set to ${formatQuantity(quantity, item)}`}
      </button>
      <BackButton onClick={onDone} />
    </form>
  )
}

function SpoiledForm({ row, name, onDone }: { row: StockRow; name: string; onDone: () => void }) {
  const { item, stock } = row
  const act = useStockAction()
  const [form, setForm] = useState<Form>(item.has_opened_form && stock.opened > 0 ? 'opened' : 'whole')
  // The purchase expiring first is usually the one that went off.
  const soonest = (f: Form) => stock.batches.find((b) => b.form === f)?.remaining ?? 0
  const [fields, setFields] = useState({ amount: amountText(soonest(form), item.display_unit, item), unit: item.display_unit })
  const quantity = amountToBase(fields.amount, fields.unit, item)
  const events = quantity === null ? [] : spoiledEvents(item, stock, quantity, form)

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        act(item, events, (t) => `${name}: ${t} left`)
        onDone()
      }}
    >
      <p className="text-sm text-ink-muted">Thrown away, not eaten. It won't count toward how fast you use it.</p>
      {item.has_opened_form && (
        <FormPicker
          value={form}
          onChange={(f) => {
            setForm(f)
            setFields({ ...fields, amount: amountText(soonest(f), fields.unit, item) })
          }}
        />
      )}
      <AmountFields label="Spoiled" amount={fields.amount} unit={fields.unit} units={entryUnits(item)} onChange={setFields} />
      <button type="submit" disabled={!events.length} className={primaryClass}>
        {events.length ? `Remove ${formatQuantity(-events[0].quantity, item)}` : 'Enter an amount'}
      </button>
      <BackButton onClick={onDone} />
    </form>
  )
}

function EditForm({ item, name, onDone, onRemoved }: { item: Item; name: string; onDone: () => void; onRemoved: () => void }) {
  const { updateItem } = useStock()
  const toast = useToast()
  const [form, setForm] = useState<ItemForm>(() => itemForm(item))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const unitsHere = displayUnits(item)
  const unitLabel = ENTRY_UNIT_LABELS[form.display_unit]

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const result = itemPatch(item, form)
        if ('error' in result) {
          setError(result.error)
          return
        }
        if (Object.keys(result.patch).length) {
          const undo = reversePatch(item, result.patch)
          updateItem(item.id, result.patch)
          toast(`${name} saved`, { undo: () => updateItem(item.id, undo) })
        }
        onDone()
      }}
    >
      <TextField label="Tamil name" value={form.name_ta} onChange={(v) => set('name_ta', v)} lang="ta" />
      <TextField label="English name" value={form.name_en} onChange={(v) => set('name_en', v)} />
      <TextField
        label="Other names"
        hint="Spellings, Hindi names, bill shorthand. Separate with commas."
        value={form.aliases}
        onChange={(v) => set('aliases', v)}
      />
      <label className="block">
        <span className="text-sm font-medium">Category</span>
        <select value={form.category} onChange={(e) => set('category', e.target.value as Category)} className={`mt-1 ${inputClass}`}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      {unitsHere.length > 1 && (
        <div>
          <span className="text-sm font-medium">Show amounts in</span>
          <div className="mt-1">
            <Segmented
              label="Show amounts in"
              options={unitsHere.map((u) => ({ value: u, label: ENTRY_UNIT_LABELS[u] }))}
              value={form.display_unit}
              onChange={(u) => {
                // Keep the step and threshold the same amounts, shown in the new unit.
                const conv = (text: string) => {
                  const base = amountToBase(text, form.display_unit, item, { allowZero: true })
                  return base === null ? text : amountText(base, u, item)
                }
                setForm((f) => ({ ...f, display_unit: u, step: conv(f.step), low_threshold: conv(f.low_threshold) }))
              }}
            />
          </div>
        </div>
      )}
      <TextField label={`+/− step (${unitLabel})`} value={form.step} onChange={(v) => set('step', v)} inputMode="decimal" />
      <TextField
        label="Shelf life (days)"
        hint="Blank for things that keep, like rice and dal."
        value={form.shelf_life_days}
        onChange={(v) => set('shelf_life_days', v)}
        inputMode="numeric"
      />
      <Check label="Staple (always keep some)" checked={form.is_staple} onChange={(v) => set('is_staple', v)} />
      <TextField
        label={`Running low below (${unitLabel})`}
        hint="Blank for none."
        value={form.low_threshold}
        onChange={(v) => set('low_threshold', v)}
        inputMode="decimal"
      />
      <Check
        label="Tracked as whole and opened (like coconut)"
        checked={form.has_opened_form}
        onChange={(v) => set('has_opened_form', v)}
      />
      {form.has_opened_form && (
        <TextField
          label="Opened, lasts (days)"
          value={form.opened_shelf_life_days}
          onChange={(v) => set('opened_shelf_life_days', v)}
          inputMode="numeric"
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-fill px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      <button type="submit" className={primaryClass}>
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          updateItem(item.id, { archived: true })
          toast(`${name} removed from your list`, { undo: () => updateItem(item.id, { archived: false }) })
          onRemoved()
        }}
        className="min-h-12 w-full rounded-xl font-medium text-red"
      >
        Remove from list
      </button>
      <BackButton onClick={onDone} />
    </form>
  )
}
