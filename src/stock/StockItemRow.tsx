import { SwipeRow } from '../components/SwipeRow.tsx'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'
import { formatQuantity } from './units.ts'
import { UrgencyChip } from './UrgencyChip.tsx'
import type { StockRow } from './view.ts'

interface Props {
  row: StockRow
  pref: ScriptPref
  /** Tap the names: the item's detail sheet. */
  onOpen: () => void
  onPlus: () => void
  onMinus: () => void
  onUsedUp: () => void
}

/** One item: names in both scripts, how much there is, how urgent, and +/−. Swipe left: used up. */
export function StockItemRow({ row, pref, onOpen, onPlus, onMinus, onUsedUp }: Props) {
  const { item, stock, urgency } = row
  const [first, second] = namePair(item, pref)
  const step = formatQuantity(item.step, item)
  const empty = stock.total <= 0
  const quantity = empty
    ? 'None'
    : `${formatQuantity(stock.total, item)}${stock.opened > 0 ? ` · ${formatQuantity(stock.opened, item)} opened` : ''}`

  const content = (
    <div className="flex items-center gap-2 px-3 py-2">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium">{first}</span>
        <span className="block truncate text-sm text-ink-muted">{second}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span>{quantity}</span>
          <UrgencyChip level={urgency.level} label={urgency.label} />
        </span>
      </button>
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
