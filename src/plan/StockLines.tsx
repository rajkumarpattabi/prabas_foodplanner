import { useState } from 'react'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'
import { AmountFields } from '../stock/fields.tsx'
import { amountToBase } from '../stock/purchase.ts'
import type { Item } from '../stock/types.ts'
import { entryUnits, formatQuantity, fromBase } from '../stock/units.ts'
import type { CookLine } from './cook.ts'

interface Props {
  lines: CookLine[]
  onChange: (lines: CookLine[]) => void
  itemsById: ReadonlyMap<string, Item>
  stockTotals: ReadonlyMap<string, number>
  pref: ScriptPref
  /** Heading for the list. */
  label: string
}

/** The stock to take, one line per item: tick or untick, change the amount. Used when cooking and making batches. */
export function StockLines({ lines, onChange, itemsById, stockTotals, pref, label }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const setLine = (itemId: string, patch: Partial<CookLine>) => onChange(lines.map((l) => (l.item_id === itemId ? { ...l, ...patch } : l)))

  if (!lines.length) return <p className="mt-1 text-sm text-ink-muted">Nothing to take from stock.</p>
  return (
    <ul className="mt-2 divide-y divide-line rounded-xl border border-line" aria-label={label}>
      {lines.map((line) => {
        const item = itemsById.get(line.item_id)
        if (!item) return null
        const itemName = namePair(item, pref)[0]
        const have = stockTotals.get(item.id) ?? 0
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
