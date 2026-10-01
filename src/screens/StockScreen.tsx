import { useMemo, useState, type ReactNode } from 'react'
import { Screen } from '../components/Screen.tsx'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { AddStockSheet } from '../stock/AddStockSheet.tsx'
import { minusEvents, plusEvents, usedUpEvents } from '../stock/actions.ts'
import { ItemDetailSheet } from '../stock/ItemDetailSheet.tsx'
import { searchItems } from '../stock/search.ts'
import { StockItemRow } from '../stock/StockItemRow.tsx'
import { useStock } from '../stock/stockContext.ts'
import { useStockAction } from '../stock/useStockAction.ts'
import { localDate } from '../lib/dates.ts'
import { leftoverRows } from '../plan/leftovers.ts'
import { useMeals } from '../plan/mealContext.ts'
import { ReadyToEat } from '../plan/ReadyToEat.tsx'
import { sections, stockRows, type StockRow } from '../stock/view.ts'

const MAX_RESULTS = 20

export function StockScreen() {
  const { status, items, eventsByItem, reload } = useStock()
  const { leftovers } = useMeals()
  const { me } = useReadyHousehold()
  // Read once when the screen opens.
  const [today] = useState(() => localDate(new Date()))
  const act = useStockAction()
  const pref = me.script_pref
  const [query, setQuery] = useState('')
  const [showFine, setShowFine] = useState(false)
  /** The Add stock sheet, when open, and the search it starts with. */
  const [adding, setAdding] = useState<{ query: string; startNew: boolean } | null>(null)
  /** The item whose detail sheet is open. */
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(() => stockRows(items, eventsByItem), [items, eventsByItem])
  const grouped = useMemo(() => sections(rows), [rows])
  const results = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.item.id, r]))
    return searchItems(
      rows.map((r) => r.item),
      query,
    )
      .slice(0, MAX_RESULTS)
      .map((i) => byId.get(i.id)!)
  }, [rows, query])

  const renderRow = (row: StockRow) => {
    const [name] = namePair(row.item, pref)
    return (
      <StockItemRow
        key={row.item.id}
        row={row}
        pref={pref}
        onOpen={() => setOpenId(row.item.id)}
        onPlus={() => act(row.item, plusEvents(row.item), (t) => `${name}: ${t}`)}
        onMinus={() => act(row.item, minusEvents(row.item, row.stock), (t) => `${name}: ${t}`)}
        onUsedUp={() => act(row.item, usedUpEvents(row.item, row.stock), () => `${name} used up`)}
      />
    )
  }

  if (status === 'loading') return <Screen title="Stock">{null}</Screen>
  if (status === 'error') {
    return (
      <Screen title="Stock">
        <div className="mt-8 text-center">
          <p className="font-medium">Couldn't load your stock</p>
          <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
          <button type="button" onClick={() => void reload()} className="mt-4 min-h-11 rounded-xl bg-leaf px-5 font-medium text-bg">
            Try again
          </button>
        </div>
      </Screen>
    )
  }

  const searching = query.trim() !== ''
  const hasLeftovers = leftoverRows(leftovers, today).length > 0
  const nothingShown = !grouped.use_soon.length && !grouped.running_low.length && !grouped.fine.length && !hasLeftovers

  return (
    <Screen title="Stock">
      <label className="block">
        <span className="sr-only">Search stock</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in Tamil or English"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3"
        />
      </label>

      {searching ? (
        results.length ? (
          <List title="Results">{results.map(renderRow)}</List>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-ink-muted">No items match "{query.trim()}".</p>
            <button type="button" onClick={() => setAdding({ query, startNew: true })} className="mt-2 min-h-11 px-3 font-medium text-leaf">
              Add it as a new item
            </button>
          </div>
        )
      ) : nothingShown ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">
          Nothing in stock yet. Tap Add stock to add what you have.
        </p>
      ) : (
        <>
          <ReadyToEat today={today} />
          {grouped.use_soon.length > 0 && <List title="Use soon">{grouped.use_soon.map(renderRow)}</List>}
          {grouped.running_low.length > 0 && <List title="Running low">{grouped.running_low.map(renderRow)}</List>}
          {grouped.fine.length > 0 && (
            <section className="mt-5">
              <button
                type="button"
                aria-expanded={showFine}
                onClick={() => setShowFine((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-leaf-fill px-3 text-sm font-medium text-leaf-strong"
              >
                <span>All good · {grouped.fine.length} {grouped.fine.length === 1 ? 'item' : 'items'} fine</span>
                <span aria-hidden="true">{showFine ? '▴' : '▾'}</span>
              </button>
              {showFine && <ul className="mt-2 rounded-xl border border-line bg-surface">{grouped.fine.map(renderRow)}</ul>}
            </section>
          )}
        </>
      )}

      {/* Room to scroll the last row clear of the button. */}
      <div className="h-16" />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl justify-end px-4">
        <button
          type="button"
          onClick={() => setAdding({ query: '', startNew: false })}
          className="pointer-events-auto min-h-12 rounded-full bg-leaf px-5 font-semibold text-bg shadow-lg"
        >
          + Add stock
        </button>
      </div>
      {openId && <ItemDetailSheet itemId={openId} onClose={() => setOpenId(null)} />}
      {adding && <AddStockSheet initialQuery={adding.query} startNew={adding.startNew} onClose={() => setAdding(null)} />}
    </Screen>
  )
}

function List({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-sm font-semibold text-ink-muted">{title}</h2>
      <ul className="rounded-xl border border-line bg-surface">{children}</ul>
    </section>
  )
}
