import { Sheet } from '../components/Sheet.tsx'
import { useDishes } from '../dishes/dishContext.ts'
import { TYPE_LABELS } from '../dishes/labels.ts'
import type { Dish } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { namePair } from '../lib/names.ts'
import { alternativeSides, type Combo } from './combos.ts'

interface Props {
  combo: Combo
  replacing: Dish
  onPick: (side: Dish) => void
  onClose: () => void
  /** A veg-only day: no non-veg sides to swap in. */
  vegOnly?: boolean
}

/** Other sides to swap in: the main's other ranked sides first, then dishes of the same type. */
export function AlternativesSheet({ combo, replacing, onPick, onClose, vegOnly = false }: Props) {
  const { dishes } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  const options = alternativeSides(combo, replacing, dishes, 12, vegOnly)
  return (
    <Sheet title={`Instead of ${namePair(replacing, pref)[0]}`} onClose={onClose}>
      {options.length ? (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line" aria-label="Other sides">
          {options.map((d) => {
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
      ) : (
        <p className="mt-2 text-sm text-ink-muted">No other sides of this kind yet. Add some on the Dishes tab.</p>
      )}
      <button data-autofocus type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-xl font-medium">
        Keep {namePair(replacing, pref)[0]}
      </button>
    </Sheet>
  )
}
