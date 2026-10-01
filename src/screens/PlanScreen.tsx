import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { SettingsIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { useDishes } from '../dishes/dishContext.ts'
import { MEAL_LABELS } from '../dishes/labels.ts'
import { MEALS, type Dish, type Meal } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, localDate } from '../lib/dates.ts'
import { AlternativesSheet } from '../plan/AlternativesSheet.tsx'
import { combosFor, swapSide, usableLeftovers, type Combo } from '../plan/combos.ts'
import { useMeals } from '../plan/mealContext.ts'
import { nextMeal } from '../plan/mealTime.ts'
import { suggest, TOP_PICKS } from '../plan/score.ts'
import { SuggestionCard } from '../plan/SuggestionCard.tsx'
import { usePlanContext } from '../plan/usePlanContext.ts'
import { useStock } from '../stock/stockContext.ts'

type Day = 'today' | 'tomorrow'

const DAY_OPTIONS: { value: Day; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
]
const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))

export function PlanScreen() {
  // The next meal to come (after dinner time, that's tomorrow's breakfast), read once
  // when the screen opens.
  const [start] = useState(() => {
    const now = new Date()
    const next = nextMeal(now)
    const today = localDate(now)
    return { today, day: (next.date === today ? 'today' : 'tomorrow') as Day, meal: next.meal }
  })
  const [day, setDay] = useState<Day>(start.day)
  const [meal, setMeal] = useState<Meal>(start.meal)
  const today = start.today
  const date = day === 'today' ? today : addDays(today, 1)

  return (
    <Screen
      title="Plan"
      actions={
        <Link to="/settings" aria-label="Settings" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted">
          <SettingsIcon />
        </Link>
      }
    >
      <div className="space-y-2">
        <Segmented label="Day" options={DAY_OPTIONS} value={day} onChange={setDay} />
        <Segmented label="Meal" options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
      </div>
      {/* Keyed so swapped sides and paging start fresh for each day and meal. */}
      <Suggestions key={`${date}:${meal}`} date={date} meal={meal} />
    </Screen>
  )
}

function Suggestions({ date, meal }: { date: string; meal: Meal }) {
  const { status: dishStatus, dishes } = useDishes()
  const { status: stockStatus } = useStock()
  const { status: mealStatus, leftovers } = useMeals()
  const pref = useReadyHousehold().me.script_pref
  const ctx = usePlanContext(date)
  // Sides swapped by hand, by main dish.
  const [swapped, setSwapped] = useState<ReadonlyMap<string, Combo>>(new Map())
  const [page, setPage] = useState(0)
  const [swapping, setSwapping] = useState<{ combo: Combo; side: Dish } | null>(null)

  const { picks, rediscovery } = useMemo(() => {
    const combos = combosFor(meal, dishes, usableLeftovers(leftovers, date)).map((c) => swapped.get(c.main.id) ?? c)
    return suggest(combos, ctx, `${date}:${meal}`)
  }, [meal, dishes, leftovers, date, swapped, ctx])

  if (dishStatus !== 'ready' || stockStatus !== 'ready' || mealStatus !== 'ready') return null
  if (!picks.length && !rediscovery) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">
        No dishes for {MEAL_LABELS[meal].toLowerCase()} yet. Add some on the Dishes tab.
      </p>
    )
  }

  const pages = Math.max(1, Math.ceil(picks.length / TOP_PICKS))
  const shown = picks.slice(page * TOP_PICKS, page * TOP_PICKS + TOP_PICKS)
  const card = (s: (typeof picks)[number], isRediscovery = false) => (
    <SuggestionCard
      key={s.combo.main.id}
      scored={s}
      pref={pref}
      rediscovery={isRediscovery}
      onSide={(side) => setSwapping({ combo: s.combo, side })}
    />
  )

  return (
    <div className="mt-4 space-y-3">
      {shown.map((s) => card(s))}
      {rediscovery && card(rediscovery, true)}
      {pages > 1 && (
        <button
          type="button"
          onClick={() => setPage((p) => (p + 1) % pages)}
          className="min-h-12 w-full rounded-xl border border-line bg-surface font-medium"
        >
          {page + 1 < pages ? 'More ideas' : 'Back to the best ideas'}
        </button>
      )}
      {swapping && (
        <AlternativesSheet
          combo={swapping.combo}
          replacing={swapping.side}
          onPick={(next) => {
            setSwapped((m) => new Map(m).set(swapping.combo.main.id, swapSide(swapping.combo, swapping.side, next)))
            setSwapping(null)
          }}
          onClose={() => setSwapping(null)}
        />
      )}
    </div>
  )
}
