import { SwipeRow } from '../components/SwipeRow.tsx'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'
import { formatQuantity } from './units.ts'
import type { Level } from './urgency.ts'
import type { StockRow } from './view.ts'

const CHIP: Record<Level, string> = {
  red: 'bg-red-fill text-red',
  amber: 'bg-turmeric-fill text-turmeric-strong',
  green: 'bg-leaf-fill text-leaf-strong',
}

interface Props {
  row: StockRow
  pref: ScriptPref
  onPlus: () => void
  onMinus: () => void
  onUsedUp: () => void
}

/** One item: names in both scripts, how much there is, how urgent, and +/−. Swipe left: used up. */
export function StockItemRow({ row, pref, onPlus, onMinus, onUsedUp }: Props) {
  const { item, stock, urgency } = row
  const [first, second] = namePair(item, pref)
  const step = formatQuantity(item.step, item)
  const empty = stock.total <= 0
  const quantity = empty
    ? 'None'
    : `${formatQuantity(stock.total, item)}${stock.opened > 0 ? ` · ${formatQuantity(stock.opened, item)} opened` : ''}`

  const content = (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{first}</p>
        <p className="truncate text-sm text-ink-muted">{second}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{quantity}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[urgency.level]}`}>{urgency.label}</span>
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${step} of ${first}`}
        disabled={empty}
        onClick={onMinus}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl disabled:opacity-40"
      >
        −
      </button>
      <button
        type="button"
        aria-label={`Add ${step} of ${first}`}
        onClick={onPlus}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-fill text-xl text-leaf-strong"
      >
        +
      </button>
      {!empty && (
        // Swiping isn't possible for everyone, so the same action is a (screen-reader) button.
        <button type="button" className="sr-only" onClick={onUsedUp}>
          Mark {first} used up
        </button>
      )}
    </div>
  )

  return (
    <li className="border-b border-line last:border-b-0">
      {empty ? content : <SwipeRow actionLabel="Used up" onSwipe={onUsedUp}>{content}</SwipeRow>}
    </li>
  )
}
