import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useBills } from '../bills/billContext.ts'
import { billTotal, reviewContext } from '../bills/context.ts'
import { useOcr, type OcrStage } from '../bills/ocr.ts'
import { parseBill, parseLine, type ParsedBill } from '../bills/parse.ts'
import { aliasesToSave, reviewLines, withChoices, type Choice, type ReviewLine, type Section } from '../bills/review.ts'
import { BackIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { useClock } from '../lib/clock.ts'
import { localDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { undoAll } from '../stock/actions.ts'
import { NewItemForm, PickItem } from '../stock/AddStockSheet.tsx'
import { ENTRY_UNIT_LABELS, inputClass, primaryClass } from '../stock/labels.ts'
import { purchaseDefaults, purchaseEvent, type PurchaseForm } from '../stock/purchase.ts'
import { useStock } from '../stock/stockContext.ts'
import type { EntryUnit, Item } from '../stock/types.ts'
import { entryUnits } from '../stock/units.ts'
import { UrgencyChip } from '../stock/UrgencyChip.tsx'
import type { Level } from '../stock/urgency.ts'

type Stage =
  | { kind: 'capture'; error?: string }
  | { kind: 'reading'; fraction: number; stage: OcrStage }
  | { kind: 'review'; bill: ParsedBill }

const SECTIONS: Record<Exclude<Section, 'other'>, { title: string; level: Level }> = {
  map: { title: 'Needs an item', level: 'red' },
  check: { title: 'Check these', level: 'amber' },
  matched: { title: 'Matched', level: 'green' },
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Scan a bill: a photo (or pasted text), then a review, then everything into stock at once. */
export function ScanScreen() {
  const ocr = useOcr()
  const [params] = useSearchParams()
  const back = params.get('from') === 'shop' ? '/shop' : '/stock'
  const [stage, setStage] = useState<Stage>({ kind: 'capture' })

  async function readPhoto(file: File) {
    if (!ocr) return
    setStage({ kind: 'reading', fraction: 0, stage: 'loading' })
    try {
      const text = await ocr.read(file, (fraction, s) => setStage({ kind: 'reading', fraction, stage: s }))
      setStage({ kind: 'review', bill: parseBill(text) })
    } catch {
      setStage({
        kind: 'capture',
        error: navigator.onLine
          ? 'Couldn’t read this photo. Try again in good light, or paste the text.'
          : 'The first scan needs the internet, to get the reader. Or paste the text.',
      })
    }
  }

  return (
    <Screen
      title="Scan a bill"
      leading={
        <Link to={back} aria-label="Back" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted">
          <BackIcon />
        </Link>
      }
    >
      {stage.kind === 'capture' && (
        <Capture
          canRead={ocr !== null}
          error={stage.error}
          onPhoto={(f) => void readPhoto(f)}
          onText={(text) => setStage({ kind: 'review', bill: parseBill(text) })}
        />
      )}
      {stage.kind === 'reading' && <Reading fraction={stage.fraction} stage={stage.stage} />}
      {stage.kind === 'review' && (
        <WhenLoaded>
          <Review
          bill={stage.bill}
          back={back}
          onBill={(bill) => setStage({ kind: 'review', bill })}
          onAgain={() => setStage({ kind: 'capture' })}
          />
        </WhenLoaded>
      )}
    </Screen>
  )
}

function Capture({ canRead, error, onPhoto, onText }: { canRead: boolean; error?: string; onPhoto: (f: File) => void; onText: (t: string) => void }) {
  const [text, setText] = useState('')
  const pasteId = useId()
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onPhoto(file)
  }
  return (
    <div className="mt-2 space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-red-fill px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      {canRead && (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">Flat on a table, in good light, the whole bill in the photo.</p>
          <label className={`${primaryClass} flex cursor-pointer items-center justify-center`}>
            Take a photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={picked} />
          </label>
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-line font-medium">
            Choose a photo
            <input type="file" accept="image/*" className="sr-only" onChange={picked} />
          </label>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onText(text)
        }}
      >
        <label htmlFor={pasteId} className="text-sm font-medium">
          {canRead ? 'Or paste the bill’s text' : 'Paste the bill’s text'}
        </label>
        <p className="text-xs text-ink-muted">Copy it with Google Lens or Live Text, one line per item.</p>
        <textarea id={pasteId} value={text} onChange={(e) => setText(e.target.value)} rows={6} className={`mt-1 ${inputClass} py-2`} />
        <button type="submit" disabled={!text.trim()} className="mt-2 min-h-12 w-full rounded-xl border border-leaf font-medium text-leaf disabled:opacity-50">
          Read this text
        </button>
      </form>
    </div>
  )
}

function Reading({ fraction, stage }: { fraction: number; stage: OcrStage }) {
  const label = stage === 'reading' ? `Reading the bill… ${Math.round(fraction * 100)}%` : 'Getting the reader ready (the first time only)…'
  return (
    <div className="mt-8">
      <p aria-live="polite">{label}</p>
      <progress aria-label="Reading the bill" value={stage === 'reading' ? fraction : undefined} max={1} className="mt-3 w-full" />
    </div>
  )
}

/** Matching needs the household's items and the names learnt from past bills. */
function WhenLoaded({ children }: { children: ReactNode }) {
  const stock = useStock().status
  const bills = useBills().status
  if (stock === 'ready' && bills === 'ready') return children
  return <p className="mt-8 text-ink-muted">{stock === 'error' || bills === 'error' ? 'Couldn’t load your items. Try again in a moment.' : 'Getting your items…'}</p>
}

function Review({ bill, back, onBill, onAgain }: { bill: ParsedBill; back: string; onBill: (b: ParsedBill) => void; onAgain: () => void }) {
  const { items, eventsByItem, record } = useStock()
  const { bills, aliases, addBill, removeBill, saveAliases } = useBills()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const navigate = useNavigate()
  const today = localDate(useClock()())
  const [vendor, setVendor] = useState(bill.vendor)
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice>>(new Map())
  const [forms, setForms] = useState<ReadonlyMap<string, { itemId: string; form: PurchaseForm }>>(new Map())
  const [picking, setPicking] = useState<ReviewLine | null>(null)
  const [open, setOpen] = useState({ matched: false, other: false })
  const vendorsId = useId()

  const ctx = useMemo(() => reviewContext({ items, eventsByItem, aliases, vendor, today }), [items, eventsByItem, aliases, vendor, today])
  const lines = useMemo(() => withChoices(reviewLines(bill, ctx), choices, ctx), [bill, ctx, choices])
  const vendors = useMemo(() => [...new Set(bills.map((b) => b.vendor).filter(Boolean))].sort(), [bills])

  const formFor = (l: ReviewLine): PurchaseForm | null => {
    if (!l.item) return null
    const f = forms.get(l.id)
    return f && f.itemId === l.item.id ? f.form : purchaseDefaults(l.item, today, l.quantity ?? undefined)
  }
  const choose = (id: string, c: Choice) => setChoices((m) => new Map(m).set(id, { ...m.get(id), ...c }))

  const going = lines.filter((l) => l.include && l.item)
  const events = going.map((l) => purchaseEvent(l.item!, formFor(l)!))
  const ready = going.length > 0 && events.every((e) => e !== null)
  const grocery = lines.filter((l) => l.section !== 'other')

  function confirm() {
    if (!ready) return
    const saved = addBill({ vendor: vendor.trim(), bill_date: today, total: billTotal(bill.lines), lines: going.length })
    const before = eventsByItem
    const added = record(events.map((e, i) => ({ ...e!, price: going[i].line.price, bill_id: saved.id })))
    const undo = undoAll(new Map(items.map((i) => [i.id, i])), before, added)
    const forget = saveAliases(aliasesToSave(lines, vendor))
    toast(`${plural(going.length, 'item', 'items')} added to stock`, {
      undo: () => {
        record(undo)
        forget()
        removeBill(saved.id)
      },
    })
    navigate(back)
  }

  const row = (l: ReviewLine) => (
    <LineRow
      key={l.id}
      l={l}
      pref={pref}
      form={formFor(l)}
      onInclude={(include) => choose(l.id, { include })}
      onItem={(item) => choose(l.id, { item })}
      onSearch={() => setPicking(l)}
      onForm={(form) => setForms((m) => new Map(m).set(l.id, { itemId: l.item!.id, form }))}
    />
  )

  return (
    <div className="mt-2">
      <label className="block">
        <span className="text-sm font-medium">Shop</span>
        <input value={vendor} onChange={(e) => setVendor(e.target.value)} list={vendorsId} maxLength={80} placeholder="Which shop?" className={`mt-1 ${inputClass}`} />
        <datalist id={vendorsId}>
          {vendors.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </label>

      {grocery.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-line p-4 text-center text-ink-muted">
          No grocery lines found. Try another photo, or paste the text.
        </p>
      )}

      {(['map', 'check'] as const).map((s) => {
        const these = lines.filter((l) => l.section === s)
        return these.length > 0 && <LineSection key={s} section={s} count={these.length}>{these.map(row)}</LineSection>
      })}

      {(() => {
        const these = lines.filter((l) => l.section === 'matched')
        if (!these.length) return null
        return (
          <LineSection section="matched" count={these.length} open={open.matched} onToggle={() => setOpen({ ...open, matched: !open.matched })}>
            {these.map(row)}
          </LineSection>
        )
      })()}

      {(() => {
        const these = lines.filter((l) => l.section === 'other')
        if (!these.length) return null
        return (
          <section className="mt-6">
            <button type="button" aria-expanded={open.other} onClick={() => setOpen({ ...open, other: !open.other })} className="min-h-11 text-sm font-medium text-ink-muted">
              Not groceries ({these.length}) · {open.other ? 'Hide' : 'Show'}
            </button>
            {open.other && (
              <ul aria-label="Not groceries" className="divide-y divide-line rounded-xl border border-line bg-surface">
                {these.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{l.line.raw}</span>
                    <button
                      type="button"
                      className="min-h-11 shrink-0 px-2 text-sm font-medium text-leaf-strong"
                      onClick={() => {
                        const i = Number(l.id.slice(1))
                        const asItem = parseLine(l.line.raw, { asItem: true })
                        if (asItem) onBill({ ...bill, lines: bill.lines.map((x, j) => (j === i ? asItem : x)) })
                      }}
                    >
                      It’s an item
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })()}

      <div className="sticky bottom-0 -mx-4 mt-6 space-y-2 bg-bg px-4 pt-3 pb-3">
        <button type="button" disabled={!ready} onClick={confirm} className={primaryClass}>
          {going.length === 0 ? 'Tick the items to add' : ready ? `Add ${plural(going.length, 'item', 'items')} to stock` : 'Check the amounts'}
        </button>
        <button type="button" onClick={onAgain} className="min-h-11 w-full rounded-xl font-medium">
          Start again
        </button>
      </div>

      {picking && (
        <PickSheet
          line={picking}
          onClose={() => setPicking(null)}
          onPick={(item) => {
            choose(picking.id, { item, include: true })
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}

function LineSection({ section, count, open = true, onToggle, children }: { section: Exclude<Section, 'other'>; count: number; open?: boolean; onToggle?: () => void; children: ReactNode }) {
  const { title, level } = SECTIONS[section]
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-6">
      <div className="flex items-center gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <UrgencyChip level={level} label={String(count)} />
        {onToggle && (
          <button type="button" aria-expanded={open} onClick={onToggle} className="ml-auto min-h-11 px-2 text-sm font-medium text-ink-muted">
            {open ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {open && (
        <ul aria-label={title} className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {children}
        </ul>
      )}
    </section>
  )
}

interface LineRowProps {
  l: ReviewLine
  pref: Parameters<typeof namePair>[1]
  form: PurchaseForm | null
  onInclude: (include: boolean) => void
  onItem: (item: Item) => void
  onSearch: () => void
  onForm: (form: PurchaseForm) => void
}

function LineRow({ l, pref, form, onInclude, onItem, onSearch, onForm }: LineRowProps) {
  const [first, second] = l.item ? namePair(l.item, pref) : [l.line.name, '']
  const guesses = l.confirmed ? [] : l.match.guesses.filter((g) => g.id !== l.item?.id)
  const units = l.item ? entryUnits(l.item) : []
  const reasonClass = l.section === 'map' ? 'text-red' : 'text-turmeric-strong'
  return (
    <li className="px-3 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={l.include}
          disabled={!l.item}
          onChange={(e) => onInclude(e.target.checked)}
          aria-label={`Add ${first}`}
          className="mt-1 h-5 w-5 shrink-0 accent-leaf"
        />
        <div className="min-w-0 flex-1">
          {l.item ? (
            <p className="font-medium">
              {first} <span className="font-normal text-ink-muted">· {second}</span>
            </p>
          ) : (
            <p className="font-medium">{l.line.name}</p>
          )}
          <p className="text-xs text-ink-muted">On the bill: {l.line.raw}</p>
          {l.reasons.map((r) => (
            <p key={r} className={`text-sm ${reasonClass}`}>
              {r}
            </p>
          ))}
          {guesses.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {guesses.map((g) => (
                <button key={g.id} type="button" onClick={() => onItem(g)} className="min-h-9 rounded-full border border-line px-3 text-sm">
                  {namePair(g, pref)[0]}
                </button>
              ))}
            </div>
          )}
        </div>
        {l.line.price !== null && <span className="shrink-0 text-sm text-ink-muted">₹{l.line.price}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 pl-8">
        {l.item && form && (
          <>
            <input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => onForm({ ...form, amount: e.target.value })}
              onFocus={(e) => e.target.select()}
              aria-label={`Amount of ${first}`}
              className="min-h-11 w-20 rounded-xl border border-line bg-bg px-3"
            />
            {units.length > 1 ? (
              <select value={form.unit} onChange={(e) => onForm({ ...form, unit: e.target.value as EntryUnit })} aria-label={`Unit for ${first}`} className="min-h-11 rounded-xl border border-line bg-bg px-2">
                {units.map((u) => (
                  <option key={u} value={u}>
                    {ENTRY_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-ink-muted">{ENTRY_UNIT_LABELS[form.unit]}</span>
            )}
          </>
        )}
        <button type="button" onClick={onSearch} className="ml-auto min-h-11 px-2 text-sm font-medium text-leaf-strong">
          {l.item ? 'Change' : 'Choose item'}
        </button>
      </div>
    </li>
  )
}

/** Which item a bill line is: search in both scripts, or make a new item. */
function PickSheet({ line, onPick, onClose }: { line: ReviewLine; onPick: (item: Item) => void; onClose: () => void }) {
  const [query, setQuery] = useState(line.line.name)
  const [making, setMaking] = useState(false)
  return (
    <Sheet title={making ? 'New item' : `Which item is “${line.line.name}”?`} onClose={onClose}>
      {making ? (
        <NewItemForm query={query} onBack={() => setMaking(false)} onCreated={onPick} />
      ) : (
        <PickItem query={query} onQuery={setQuery} onPick={onPick} onNew={() => setMaking(true)} />
      )}
    </Sheet>
  )
}
