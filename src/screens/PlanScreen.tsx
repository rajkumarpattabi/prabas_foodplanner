import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { dayContext, type DayContext } from '../calendar/dayContext.ts'
import { useCalendar } from '../calendar/calendarContext.ts'
import { NonVegIcon, PoriyalIcon, SettingsIcon } from '../components/icons.tsx'
import { useClock } from '../lib/clock.ts'
import { Screen } from '../components/Screen.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { useToast } from '../components/toastContext.ts'
import { useDishes } from '../dishes/dishContext.ts'
import { MEAL_LABELS } from '../dishes/labels.ts'
import { MEALS, type Dish, type Meal } from '../dishes/types.ts'
import { useReadyHousehold } from '../household/householdContext.ts'
import { addDays, localDate, type LocalDate } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { attribution } from '../lib/time.ts'
import { AlternativesSheet } from '../plan/AlternativesSheet.tsx'
import { comboFor, comboFromMeal, comboIsNonVeg, combosFor, PLAIN_RICE_KEY, swapSide, usableLeftovers, type Combo } from '../plan/combos.ts'
import { CookSheet } from '../plan/CookSheet.tsx'
import { useMeals } from '../plan/mealContext.ts'
import { nextMeal } from '../plan/mealTime.ts'
import { scoreCombo, suggest, TOP_PICKS, type PlanContext, type Scored } from '../plan/score.ts'
import { SuggestionCard } from '../plan/SuggestionCard.tsx'
import type { MealRecord } from '../plan/types.ts'
import { usePlanContext } from '../plan/usePlanContext.ts'
import { swapIdea, swapText } from '../nutrition/swaps.ts'
import { useBatches } from '../prepared/batchContext.ts'
import { InProgress } from '../prepared/InProgress.tsx'
import { BalanceCard } from './BalanceScreen.tsx'
import { useNow } from '../prepared/useNow.ts'
import { shortDate } from '../stock/history.ts'
import { useStock } from '../stock/stockContext.ts'

type Day = 'today' | 'tomorrow'

const DAY_OPTIONS: { value: Day; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
]
const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))

const primary = 'min-h-12 flex-1 rounded-xl bg-leaf font-semibold text-bg'
const secondary = 'min-h-12 flex-1 rounded-xl border border-line bg-surface font-medium'

export function PlanScreen() {
  // The next meal to come (after dinner time, that's tomorrow's breakfast), read once
  // when the screen opens.
  const clock = useClock()
  const now = useNow()
  const [start] = useState(() => {
    const now = clock()
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
      <InProgress now={now}>
        <div className="space-y-2">
          <Segmented label="Day" options={DAY_OPTIONS} value={day} onChange={setDay} />
          <Segmented label="Meal" options={MEAL_OPTIONS} value={meal} onChange={setMeal} />
        </div>
        {/* Keyed so swapped sides and paging start fresh for each day and meal. */}
        <MealPlan key={`${date}:${meal}`} date={date} meal={meal} today={today} />
        <BalanceCard />
      </InProgress>
    </Screen>
  )
}

/** "tomorrow's breakfast", "today's lunch", or "dinner on 5 Oct". */
function whenLabel(date: LocalDate, meal: Meal, today: LocalDate): string {
  const m = MEAL_LABELS[meal].toLowerCase()
  if (date === today) return `today's ${m}`
  if (date === addDays(today, 1)) return `tomorrow's ${m}`
  return `${m} on ${shortDate(date)}`
}

/**
 * One meal of one day: its plan (or what was cooked) if there is one, otherwise
 * suggestions to plan from. Once either phone plans it, both see the plan.
 */
function MealPlan({ date, meal, today }: { date: LocalDate; meal: Meal; today: LocalDate }) {
  const { status: dishStatus, dishes, dishesById } = useDishes()
  const { status: stockStatus } = useStock()
  const { status: mealStatus, leftovers, mealFor, planMeal, removeMeal, restoreMeal } = useMeals()
  const { status: calendarStatus, days } = useCalendar()
  const { status: batchStatus } = useBatches()
  const pref = useReadyHousehold().me.script_pref
  const toast = useToast()
  // The family's food rules for this day: veg only (and why), or a non-veg day.
  const day = useMemo(() => dayContext(date, days), [date, days])
  const ctx = usePlanContext(date, day.nonVegDay, day.vegOnly)
  const usable = useMemo(() => usableLeftovers(leftovers, date), [leftovers, date])
  const existing = mealFor(date, meal)
  const [changing, setChanging] = useState(false)
  // Sides swapped by hand on suggestions, by main dish.
  const [swapped, setSwapped] = useState<ReadonlyMap<string, Combo>>(new Map())
  const [page, setPage] = useState(0)
  const [swapping, setSwapping] = useState<{ combo: Combo; side: Dish; planned: boolean } | null>(null)
  const [cooking, setCooking] = useState<Combo | null>(null)

  const { picks, rediscovery } = useMemo(() => {
    // A combo switched to another main (a swap idea) stands in for it; never two cards for one main.
    const seen = new Set<string>()
    const combos = combosFor(meal, dishes, usable, { vegOnly: day.vegOnly })
      .map((c) => swapped.get(c.main.id) ?? c)
      .filter((c) => !seen.has(c.main.id) && !!seen.add(c.main.id))
    return suggest(combos, ctx, `${date}:${meal}`)
  }, [meal, dishes, usable, date, swapped, ctx, day.vegOnly])

  if (dishStatus !== 'ready' || stockStatus !== 'ready' || mealStatus !== 'ready' || calendarStatus !== 'ready' || batchStatus !== 'ready') return null

  const when = whenLabel(date, meal, today)
  const dishName = (d: Dish) => namePair(d, pref)[0]
  /** The original main a card stands for: a card switched to another main keeps its slot. */
  const slotOf = (c: Combo) => [...swapped.entries()].find(([, v]) => v === c)?.[0] ?? c.main.id

  const plan = (combo: Combo) => {
    const before = existing ?? null
    planMeal(date, meal, combo)
    setChanging(false)
    toast(`${dishName(combo.main)} planned for ${when}`, { undo: () => restoreMeal(date, meal, before) })
  }

  const cookSheet = cooking && <CookSheet date={date} meal={meal} combo={cooking} onClose={() => setCooking(null)} />
  const sheet = swapping && (
    <AlternativesSheet
      combo={swapping.combo}
      replacing={swapping.side}
      vegOnly={day.vegOnly}
      onPick={(next) => {
        const combo = swapSide(swapping.combo, swapping.side, next)
        if (swapping.planned) plan(combo)
        else setSwapped((m) => new Map(m).set(slotOf(swapping.combo), combo))
        setSwapping(null)
      }}
      onClose={() => setSwapping(null)}
    />
  )

  // The sheets sit in the same place whatever shows, so cooking (which turns the
  // suggestions into the cooked meal) doesn't close the sheet before its leftovers step.
  const withSheets = (content: ReactNode) => (
    <>
      <DayChip day={day} />
      {content}
      {sheet}
      {cookSheet}
    </>
  )

  if (existing && !changing) {
    return withSheets(
      <div className="mt-4">
        <PlannedMeal
          record={existing}
          combo={comboFromMeal(existing.dish_ids, dishesById, usable)}
          ctx={ctx}
          day={day}
          onSide={(combo, side) => setSwapping({ combo, side, planned: true })}
          onCook={setCooking}
          onChange={() => setChanging(true)}
          onRemove={() => {
            removeMeal(date, meal)
            toast(`Plan for ${when} removed`, { undo: () => restoreMeal(date, meal, existing) })
          }}
        />
      </div>,
    )
  }

  if (!picks.length && !rediscovery) {
    return withSheets(
      <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">
        No dishes for {MEAL_LABELS[meal].toLowerCase()} yet. Add some on the Dishes tab.
      </p>,
    )
  }

  const pages = Math.max(1, Math.ceil(picks.length / TOP_PICKS))
  const shown = picks.slice(page * TOP_PICKS, page * TOP_PICKS + TOP_PICKS)
  const swapFor = (s: Scored) => {
    if (!ctx.nutrition) return null
    const idea = swapIdea({ combo: s.combo, meal, nutrition: ctx.nutrition, dishes, history: ctx.history, itemsById: ctx.itemsById, vegOnly: day.vegOnly })
    if (!idea) return null
    return {
      text: swapText(idea, dishName),
      onSwap: () => {
        const slot = slotOf(s.combo)
        const before = swapped.get(slot)
        // A new main comes with its own ranked sides; an added side keeps the rest.
        const next =
          idea.kind === 'main'
            ? comboFor(idea.dish, dishesById, usable, dishes.find((d) => d.catalog_key === PLAIN_RICE_KEY) ?? null, day.vegOnly)
            : idea.combo
        setSwapped((m) => new Map(m).set(slot, next))
        toast(`Switched to ${dishName(idea.combo.main)}${idea.kind === 'side' ? ` with ${dishName(idea.dish)}` : ''}`, {
          undo: () =>
            setSwapped((m) => {
              const next = new Map(m)
              if (before) next.set(slot, before)
              else next.delete(slot)
              return next
            }),
        })
      },
    }
  }
  const card = (s: Scored, isRediscovery = false) => (
    <SuggestionCard
      key={s.combo.main.id}
      scored={s}
      pref={pref}
      rediscovery={isRediscovery}
      swap={swapFor(s)}
      onSide={(side) => setSwapping({ combo: s.combo, side, planned: false })}
    >
      <button type="button" onClick={() => plan(s.combo)} className={primary}>
        Plan this
      </button>
      <button type="button" onClick={() => setCooking(s.combo)} className={secondary}>
        Cook this
      </button>
    </SuggestionCard>
  )

  return withSheets(
    <div className="mt-4 space-y-3">
      {changing && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-leaf-fill px-3 py-2">
          <p className="text-sm font-medium text-leaf-strong">Pick a new plan for {when}</p>
          <button type="button" onClick={() => setChanging(false)} className="min-h-11 shrink-0 px-2 text-sm font-medium text-leaf-strong">
            Keep the plan
          </button>
        </div>
      )}
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
    </div>,
  )
}

/** A planned or cooked meal: who did it and when, and what's in it. */
function PlannedMeal({
  record,
  combo,
  ctx,
  onSide,
  onCook,
  onChange,
  onRemove,
  day,
}: {
  record: MealRecord
  combo: Combo | null
  ctx: PlanContext
  day: DayContext
  onSide: (combo: Combo, side: Dish) => void
  onCook: (combo: Combo) => void
  onChange: () => void
  onRemove: () => void
}) {
  const { me, members } = useReadyHousehold()
  const names = new Map(members.map((m) => [m.userId, m.profile?.display_name ?? '']))
  const cooked = record.status === 'cooked'
  const byLine = cooked
    ? attribution({ by: record.cooked_by, at: record.cooked_at!, me: me.user_id, names, verb: 'Cooked' })
    : attribution({ by: record.updated_by ?? record.created_by, at: record.updated_at, me: me.user_id, names, verb: 'Planned' })
  // Planned before the day turned out to be veg-only (a date confirmed later, say).
  const clash = !cooked && day.vegOnly && combo !== null && comboIsNonVeg(combo)
  const header = (
    <div className="mb-3">
      <p className={`text-sm font-semibold ${cooked ? 'text-ink-muted' : 'text-leaf'}`}>{cooked ? 'Cooked' : 'Planned'}</p>
      <p className="text-xs text-ink-muted">{byLine}</p>
      {clash && (
        <p role="alert" className="mt-2 rounded-xl bg-red-fill px-3 py-2 text-sm font-medium text-red">
          Non-veg on a veg-only day ({day.restrictions[0]?.label}). Change it?
        </p>
      )}
    </div>
  )
  const actions = !cooked && (
    <>
      {combo && (
        <button type="button" onClick={() => onCook(combo)} className={primary}>
          Cook this
        </button>
      )}
      <button type="button" onClick={onChange} className={secondary}>
        Change
      </button>
      <button type="button" onClick={onRemove} className={secondary}>
        Remove
      </button>
    </>
  )

  if (!combo) {
    // The main dish has been deleted since: show the names saved with the meal.
    return (
      <article aria-label={record.dish_names[0]?.name_en ?? 'Meal'} className="rounded-2xl border border-line bg-surface p-4">
        {header}
        <p className="font-medium">{record.dish_names.map((n) => (me.script_pref === 'en_first' ? n.name_en : n.name_ta)).join(', ')}</p>
        {actions && <div className="mt-4 flex gap-2">{actions}</div>}
      </article>
    )
  }
  return (
    <SuggestionCard
      scored={scoreCombo(combo, ctx)}
      pref={me.script_pref}
      header={header}
      onSide={(side) => {
        if (!cooked) onSide(combo, side)
      }}
    >
      {actions}
    </SuggestionCard>
  )
}

/** The day's food rule: veg only (and why), or a non-veg day. Tap for the calendar. */
function DayChip({ day }: { day: DayContext }) {
  if (!day.chip) return null
  const Icon = day.vegOnly ? PoriyalIcon : NonVegIcon
  return (
    <Link
      to="/calendar"
      className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium ${
        day.vegOnly ? 'bg-leaf-fill text-leaf-strong' : 'bg-red-fill text-red'
      }`}
    >
      <Icon width={18} height={18} aria-hidden="true" />
      {day.chip}
    </Link>
  )
}
