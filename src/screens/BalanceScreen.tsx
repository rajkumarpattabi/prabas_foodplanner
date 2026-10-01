import { useState } from 'react'
import { Link } from 'react-router'
import { BackIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { useReadyHousehold } from '../household/householdContext.ts'
import { formatDay } from '../lib/dates.ts'
import { namePair } from '../lib/names.ts'
import { BALANCE } from '../nutrition/balance.ts'
import { GROUP_TITLES, GROUP_WORDS, GROUPS } from '../nutrition/groups.ts'
import { gapText } from '../nutrition/nudges.ts'
import { useBalance } from '../nutrition/useBalance.ts'
import { plural, statText, summaryLine } from '../nutrition/words.ts'
import { UrgencyChip } from '../stock/UrgencyChip.tsx'

type Period = 'week' | 'fortnight'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'fortnight', label: 'Last 14 days' },
]

const LEVEL_WORDS = { green: 'Good', amber: 'A little short', red: 'Short' } as const

/** Food balance: each group this week or over the last fortnight, and what's short. */
export function BalanceScreen() {
  const b = useBalance()
  const pref = useReadyHousehold().me.script_pref
  const [period, setPeriod] = useState<Period>('week')
  const shown = period === 'week' ? b.week : b.fortnight

  return (
    <Screen
      title="Food balance"
      leading={
        <Link to="/plan" aria-label="Back to plan" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted">
          <BackIcon />
        </Link>
      }
    >
      {b.ready && shown && (
        <>
          <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} />
          <p className="mt-3 text-sm text-ink-muted">
            {formatDay(shown.from, { weekday: true })} to {formatDay(shown.to, { weekday: true })} · {plural(shown.meals, 'meal', 'meals')} cooked
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface" aria-label="Food groups">
            {GROUPS.map((g) => {
              const s = shown.stats[g]
              return (
                <li key={g} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{GROUP_TITLES[g]}</p>
                    <p className="text-sm text-ink-muted">{statText(s, shown)}</p>
                  </div>
                  <UrgencyChip level={s.level} label={LEVEL_WORDS[s.level]} />
                </li>
              )
            })}
          </ul>

          <section className="mt-6" aria-labelledby="short">
            <h2 id="short" className="text-sm font-semibold text-ink-muted">
              Short this fortnight
            </h2>
            {!b.nutrition?.enough ? (
              <p className="mt-2 text-sm text-ink-muted">
                This fills in as you cook. Gaps show once there are {BALANCE.minMeals} cooked meals over at least a week.
              </p>
            ) : b.ideas.length ? (
              <ul className="mt-2 space-y-2" aria-label="Short this fortnight">
                {b.ideas.map(({ gap, dish }) => (
                  <li key={gap.group} className="rounded-xl bg-leaf-fill px-3 py-2 text-sm text-leaf-strong">
                    <span className="font-medium">{gapText(gap)}</span>
                    {` Try ${namePair(dish, pref)[0]} for ${GROUP_WORDS[gap.group]}.`}
                  </li>
                ))}
              </ul>
            ) : b.nutrition.gaps.length ? (
              <p className="mt-2 text-sm text-ink-muted">Some groups are short (above), but none of your dishes has them yet.</p>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Nothing short. Well balanced.</p>
            )}
          </section>
        </>
      )}
    </Screen>
  )
}

/** The summary at the bottom of Plan, opening Food balance. */
export function BalanceCard() {
  const b = useBalance()
  if (!b.ready || !b.week) return null
  return (
    <Link to="/balance" className="mt-6 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
      <span>{summaryLine(b.week)}</span>
      <span aria-hidden="true" className="text-ink-muted">
        ›
      </span>
    </Link>
  )
}
