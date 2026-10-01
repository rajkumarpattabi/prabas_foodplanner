import { useToast } from '../components/toastContext.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import type { LocalDate } from '../lib/dates.ts'
import { UrgencyChip } from '../stock/UrgencyChip.tsx'
import { leftoverRows } from './leftovers.ts'
import { useMeals } from './mealContext.ts'

/** Leftovers on the Stock tab: soonest first, each with how long it's good for, and Eaten. */
export function ReadyToEat({ today }: { today: LocalDate }) {
  const { leftovers, setLeftoverEaten, setLeftoverExpiry } = useMeals()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  const rows = leftoverRows(leftovers, today)
  if (!rows.length) return null

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-sm font-semibold text-ink-muted">Ready to eat</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Ready to eat">
        {rows.map(({ leftover: l, level, label }) => {
          const [first, second] = pref === 'en_first' ? [l.name_en, l.name_ta] : [l.name_ta, l.name_en]
          return (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{first}</p>
                <p className="truncate text-sm text-ink-muted">{second}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {l.servings} {l.servings === 1 ? 'serving' : 'servings'}
                  </span>
                  <UrgencyChip level={level} label={label} />
                </p>
                <label className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                  Good until
                  <input
                    type="date"
                    aria-label={`Good until, for ${first}`}
                    value={l.expires_on}
                    onChange={(e) => e.target.value && setLeftoverExpiry(l.id, e.target.value)}
                    className="min-h-9 rounded-lg border border-line bg-bg px-2"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLeftoverEaten(l.id, true)
                  toast(`${first} eaten`, { undo: () => setLeftoverEaten(l.id, false) })
                }}
                className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm font-medium"
              >
                Eaten
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
