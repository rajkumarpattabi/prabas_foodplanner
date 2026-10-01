import type { ReactNode } from 'react'
import { DishBadges, DishIcon } from '../dishes/DishBits.tsx'
import type { Dish } from '../dishes/types.ts'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'
import type { Scored } from './score.ts'

interface Props {
  scored: Scored
  pref: ScriptPref
  /** The rediscovery card: styled apart, with "Bring back?". */
  rediscovery?: boolean
  /** Shown at the top instead, as on a planned or cooked meal. */
  header?: ReactNode
  /** Tap a side to swap it. */
  onSide: (side: Dish) => void
  /** The card's actions (plan, cook), in the lower part of the card. */
  children?: ReactNode
}

/** One combo: the main in both scripts, its sides, why it's suggested, and when it was last cooked. */
export function SuggestionCard({ scored, pref, rediscovery, header, onSide, children }: Props) {
  const { combo, why, needs, cooked } = scored
  const [first, second] = namePair(combo.main, pref)
  return (
    <article
      aria-label={first}
      className={`rounded-2xl border p-4 ${rediscovery ? 'border-purple/30 bg-purple-fill' : 'border-line bg-surface'}`}
    >
      {header ?? (rediscovery && <p className="mb-2 text-sm font-semibold text-purple">Bring back?</p>)}
      <div className="flex items-start gap-3">
        <DishIcon type={combo.main.type} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{first}</h2>
          <p className="text-sm text-ink-muted">{second}</p>
        </div>
      </div>

      {(combo.sides.length > 0 || combo.base) && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sides">
          {combo.base && (
            <li className="flex min-h-10 items-center rounded-full border border-line px-3 text-sm text-ink-muted">
              + {namePair(combo.base, pref)[0]}
            </li>
          )}
          {combo.sides.map((side) => {
            const isLeftover = combo.leftover?.dish_id === side.id
            return (
              <li key={side.id}>
                <button
                  type="button"
                  onClick={() => onSide(side)}
                  className="min-h-10 rounded-full bg-teal-fill px-3 text-sm font-medium text-teal"
                >
                  {namePair(side, pref)[0]}
                  {isLeftover && <span className="font-normal">{' · leftover'}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {why && <p className="mt-3 text-sm">{why}</p>}
      <p className="mt-1 text-xs text-ink-muted">{cooked}</p>
      {needs.length > 0 && (
        <p className="mt-2 inline-block rounded-full bg-turmeric-fill px-2 py-0.5 text-xs font-medium text-turmeric-strong">
          Needs {needs.slice(0, 2).join(', ')}
          {needs.length > 2 ? ` and ${needs.length - 2} more` : ''}
        </p>
      )}
      <div className="mt-3">
        <DishBadges dish={combo.main} />
      </div>
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </article>
  )
}
