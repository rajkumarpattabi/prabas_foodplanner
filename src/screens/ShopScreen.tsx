import { useState } from 'react'
import { Screen } from '../components/Screen.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import type { NonVegNudge, ShopLine } from '../shop/build.ts'
import { SECTION_TITLES, shareText, whatsappLink } from '../shop/share.ts'
import { useShopping } from '../shop/shoppingContext.ts'
import { SECTIONS } from '../shop/types.ts'
import { useShoppingList } from '../shop/useShoppingList.ts'
import { usualAmount } from '../shop/usual.ts'
import { BoughtForm, NewItemForm, PickItem } from '../stock/AddStockSheet.tsx'
import { useStock } from '../stock/stockContext.ts'
import type { Item } from '../stock/types.ts'
import { formatQuantity } from '../stock/units.ts'
import { UrgencyChip } from '../stock/UrgencyChip.tsx'

/**
 * The shopping list: worked out from stock, plans and batches, plus what was added by
 * hand. Ticking a line off says how much was bought, and adds it to stock.
 */
export function ShopScreen() {
  const list = useShoppingList()
  const pref = useReadyHousehold().me.script_pref
  const [buying, setBuying] = useState<ShopLine | null>(null)
  const [adding, setAdding] = useState(false)
  const [sharing, setSharing] = useState<string | null>(null)

  const share = async () => {
    const text = shareText(list.lines, list.nudges, list.today, pref)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        // Closed without sharing: nothing to do.
        if ((e as Error)?.name === 'AbortError') return
      }
    }
    setSharing(text)
  }

  const empty = list.lines.length === 0 && list.nudges.length === 0
  return (
    <Screen
      title="Shop"
      actions={
        list.ready && !empty ? (
          <button type="button" onClick={() => void share()} className="-mr-2 min-h-11 rounded-full px-3 font-medium text-leaf-strong">
            Share
          </button>
        ) : null
      }
    >
      {list.ready && (
        <>
          {empty && (
            <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">
              Nothing to buy. Things show up here when stock runs low, or a planned meal needs something.
            </p>
          )}
          {list.nudges.map((n) => (
            <NonVegCard key={n.date} nudge={n} />
          ))}
          {SECTIONS.map((s) => {
            const lines = list.lines.filter((l) => l.section === s)
            if (!lines.length) return null
            return (
              <section key={s} className="mt-4" aria-labelledby={`shop-${s}`}>
                <h2 id={`shop-${s}`} className="mb-2 text-sm font-semibold text-ink-muted">
                  {SECTION_TITLES[s]}
                </h2>
                <ul className={`divide-y divide-line rounded-xl border border-line bg-surface ${s === 'maybe' ? 'opacity-90' : ''}`} aria-label={SECTION_TITLES[s]}>
                  {lines.map((l) => (
                    <ShopRow key={l.item.id} line={l} onBuy={() => setBuying(l)} />
                  ))}
                </ul>
              </section>
            )
          })}
          <button type="button" onClick={() => setAdding(true)} className="mt-6 min-h-12 w-full rounded-xl border border-dashed border-line font-medium text-leaf-strong">
            + Add item
          </button>
        </>
      )}
      {buying && <BuySheet line={buying} onClose={() => setBuying(null)} />}
      {adding && <AddToListSheet onClose={() => setAdding(false)} />}
      {sharing !== null && <ShareSheet text={sharing} onClose={() => setSharing(null)} />}
    </Screen>
  )
}

/** Today or tomorrow is a non-veg day with nothing non-veg planned: one tap puts fish or meat on the list. */
function NonVegCard({ nudge }: { nudge: NonVegNudge }) {
  const { rows, addWant, removeRow } = useShopping()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  return (
    <section aria-labelledby={`nonveg-${nudge.date}`} className="mt-4 rounded-2xl border border-red bg-red-fill p-3">
      <h2 id={`nonveg-${nudge.date}`} className="font-medium text-red">
        {nudge.day} is a non-veg day · fish or meat?
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {nudge.items.map((item) => {
          const [first] = namePair(item, pref)
          const listed = rows.some((r) => r.item_id === item.id && r.kind === 'want' && !r.done_at)
          return (
            <button
              key={item.id}
              type="button"
              disabled={listed}
              aria-label={listed ? `${first} is on the list` : `Add ${first}`}
              onClick={() => {
                const row = addWant(item.id)
                toast(`${first} added to the list`, { undo: () => removeRow(row.id) })
              }}
              className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink disabled:opacity-60"
            >
              {listed ? `${first} ✓` : `+ ${first}`}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ShopRow({ line, onBuy }: { line: ShopLine; onBuy: () => void }) {
  const { skip, removeRow, addWant, rows } = useShopping()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [first, second] = namePair(line.item, pref)
  const handOnly = line.section === 'added'
  // A short chip (never colour alone); the reasons go underneath.
  const [chip, reasons] =
    line.section === 'low'
      ? [line.reasons[0], line.reasons.slice(1)]
      : line.section === 'planned'
        ? [line.level === 'red' ? 'Today' : line.level === 'amber' ? 'Tomorrow' : 'In a few days', line.reasons]
        : line.section === 'maybe'
          ? ['Maybe', line.reasons]
          : [null, line.reasons]

  const onSkip = () => {
    if (handOnly) {
      const want = rows.find((r) => r.id === line.wantId)
      removeRow(line.wantId!)
      toast(`${first} taken off the list`, { undo: () => void addWant(line.item.id, want?.quantity ?? null) })
      return
    }
    const s = skip(line.item.id, line.section)
    toast(`${first} skipped for a few days`, { undo: () => removeRow(s.id) })
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        aria-label={`Bought ${first}`}
        onClick={onBuy}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-leaf text-leaf"
      >
        <span aria-hidden="true" className="h-4 w-4 rounded-full" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {first} <span className="text-sm font-normal text-ink-muted">{second}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {line.quantity !== null && <span className="font-medium">{formatQuantity(line.quantity, line.item)}</span>}
          {chip && <UrgencyChip level={line.level} label={chip} />}
        </p>
        {reasons.map((r) => (
          <p key={r} className="mt-0.5 text-xs text-ink-muted">
            {r}
          </p>
        ))}
      </div>
      <button type="button" onClick={onSkip} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-ink-muted">
        {handOnly ? 'Remove' : 'Skip'}
      </button>
    </li>
  )
}

/** Ticking a line off: how much was bought (the usual amount, or enough for what's short), into stock. */
function BuySheet({ line, onClose }: { line: ShopLine; onClose: () => void }) {
  const { eventsByItem } = useStock()
  const { setBought } = useShopping()
  const pref = useReadyHousehold().me.script_pref
  const [first] = namePair(line.item, pref)
  const wantId = line.wantId
  return (
    <Sheet title={`Bought ${first}`} onClose={onClose}>
      <BoughtForm
        item={line.item}
        quantity={usualAmount(line.item, eventsByItem.get(line.item.id) ?? [], line.quantity)}
        also={wantId ? { done: () => setBought(wantId, true), undo: () => setBought(wantId, false) } : undefined}
        onSaved={onClose}
      />
    </Sheet>
  )
}

/** + Add item: search in either script (or make a new item); it goes on the list at once. */
function AddToListSheet({ onClose }: { onClose: () => void }) {
  const { addWant, removeRow, rows } = useShopping()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState(false)

  const add = (item: Item) => {
    const already = rows.some((r) => r.item_id === item.id && r.kind === 'want' && !r.done_at)
    const [first] = namePair(item, pref)
    const row = addWant(item.id)
    toast(already ? `${first} is on the list already` : `${first} added to the list`, already ? undefined : { undo: () => removeRow(row.id) })
    onClose()
  }

  return (
    <Sheet title={making ? 'New item' : 'Add to the list'} onClose={onClose}>
      {making ? (
        <NewItemForm query={query} onBack={() => setMaking(false)} onCreated={add} />
      ) : (
        <PickItem query={query} onQuery={setQuery} onPick={add} onNew={() => setMaking(true)} />
      )}
    </Sheet>
  )
}

/** For phones without a share sheet: open WhatsApp, or copy the text. */
function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const toast = useToast()
  return (
    <Sheet title="Share the list" onClose={onClose}>
      <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-bg p-3 text-sm">{text}</pre>
      <div className="mt-4 flex flex-col gap-2">
        <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-xl bg-leaf font-semibold text-bg">
          Open WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(
              () => toast('List copied'),
              () => toast("Couldn't copy. Select the text instead."),
            )
          }}
          className="min-h-12 rounded-xl border border-line font-medium"
        >
          Copy
        </button>
      </div>
    </Sheet>
  )
}
