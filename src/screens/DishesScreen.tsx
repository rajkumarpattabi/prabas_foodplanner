import { useMemo, useState, type ReactNode } from 'react'
import { Screen } from '../components/Screen.tsx'
import { DishBadges, DishIcon } from '../dishes/DishBits.tsx'
import { DishDetailSheet } from '../dishes/DishDetailSheet.tsx'
import { useDishes } from '../dishes/dishContext.ts'
import { filterDishes, NO_FILTER, type DishFilter } from '../dishes/filter.ts'
import { MEAL_LABELS, TYPE_LABELS } from '../dishes/labels.ts'
import { DISH_TYPES, MEALS, type Dish, type DishType } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import type { ScriptPref } from '../lib/database.types.ts'
import { namePair } from '../lib/names.ts'

export function DishesScreen() {
  const { status, dishes, reload } = useDishes()
  const pref = useReadyHousehold().me.script_pref
  const [filter, setFilter] = useState<DishFilter>(NO_FILTER)
  /** The dish whose detail sheet is open. */
  const [openId, setOpenId] = useState<string | null>(null)
  const shown = useMemo(() => filterDishes(dishes, filter), [dishes, filter])
  const set = (patch: Partial<DishFilter>) => setFilter((f) => ({ ...f, ...patch }))

  if (status === 'loading') return <Screen title="Dishes">{null}</Screen>
  if (status === 'error') {
    return (
      <Screen title="Dishes">
        <div className="mt-8 text-center">
          <p className="font-medium">Couldn't load your dishes</p>
          <p className="mt-1 text-sm text-ink-muted">Check your connection and try again.</p>
          <button type="button" onClick={() => void reload()} className="mt-4 min-h-11 rounded-xl bg-leaf px-5 font-medium text-bg">
            Try again
          </button>
        </div>
      </Screen>
    )
  }

  const searching = filter.query.trim() !== ''
  const filtered = filter.type || filter.meal || filter.favourites || filter.hidden

  return (
    <Screen title="Dishes">
      <label className="block">
        <span className="sr-only">Search dishes</span>
        <input
          type="search"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search in Tamil or English"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3"
        />
      </label>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show">
        <Toggle pressed={filter.favourites} onClick={() => set({ favourites: !filter.favourites })}>
          Favourites
        </Toggle>
        <Toggle pressed={filter.hidden} onClick={() => set({ hidden: !filter.hidden })}>
          Not suggested
        </Toggle>
        {MEALS.map((m) => (
          <Toggle key={m} pressed={filter.meal === m} onClick={() => set({ meal: filter.meal === m ? null : m })}>
            {MEAL_LABELS[m]}
          </Toggle>
        ))}
      </div>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Type">
        {DISH_TYPES.map((t) => (
          <Toggle key={t} pressed={filter.type === t} onClick={() => set({ type: filter.type === t ? null : t })}>
            {TYPE_LABELS[t]}
          </Toggle>
        ))}
      </div>

      <p className="mt-3 text-sm text-ink-muted" aria-live="polite">
        <span>{`${shown.length} ${shown.length === 1 ? 'dish' : 'dishes'}`}</span>
        {filtered && (
          <>
            {' · '}
            <button type="button" onClick={() => setFilter({ ...NO_FILTER, query: filter.query })} className="font-medium text-leaf">
              Clear filters
            </button>
          </>
        )}
      </p>

      {shown.length === 0 ? (
        <p className="mt-6 text-center text-ink-muted">
          {searching ? `No dishes match "${filter.query.trim()}".` : 'No dishes match these filters.'}
        </p>
      ) : searching ? (
        <DishList dishes={shown} pref={pref} onOpen={setOpenId} />
      ) : (
        groupByType(shown).map(([type, list]) => (
          <section key={type} className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-ink-muted">{TYPE_LABELS[type]}</h2>
            <DishList dishes={list} pref={pref} onOpen={setOpenId} />
          </section>
        ))
      )}
      {openId && <DishDetailSheet dishId={openId} onClose={() => setOpenId(null)} />}
    </Screen>
  )
}

/** Keeps filterDishes' order: by type, then name. */
function groupByType(dishes: readonly Dish[]): [DishType, Dish[]][] {
  const groups = new Map<DishType, Dish[]>()
  for (const d of dishes) groups.set(d.type, [...(groups.get(d.type) ?? []), d])
  return [...groups]
}

function DishList({ dishes, pref, onOpen }: { dishes: readonly Dish[]; pref: ScriptPref; onOpen: (id: string) => void }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {dishes.map((d) => (
        <DishRow key={d.id} dish={d} pref={pref} onOpen={() => onOpen(d.id)} />
      ))}
    </ul>
  )
}

function DishRow({ dish, pref, onOpen }: { dish: Dish; pref: ScriptPref; onOpen: () => void }) {
  const [first, second] = namePair(dish, pref)
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <DishIcon type={dish.type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{first}</span>
          <span className="block truncate text-sm text-ink-muted">{second}</span>
          <span className="mt-1 block">
            <DishBadges dish={dish} />
          </span>
        </span>
      </button>
    </li>
  )
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-3 text-sm font-medium ${
        pressed ? 'border-leaf bg-leaf-fill text-leaf-strong' : 'border-line bg-surface text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}
