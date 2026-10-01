import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCalendar } from '../calendar/calendarContext.ts'
import { TYPE_NAMES, type CalendarDay, type CalendarType } from '../calendar/types.ts'
import { calendarMonths, toCheckCount } from '../calendar/view.ts'
import { BackIcon } from '../components/icons.tsx'
import { Screen } from '../components/Screen.tsx'
import { Segmented } from '../components/Segmented.tsx'
import { Sheet } from '../components/Sheet.tsx'
import { useToast } from '../components/toastContext.ts'
import { useClock } from '../lib/clock.ts'
import { formatDay, localDate, type LocalDate } from '../lib/dates.ts'
import { inputClass, primaryClass } from '../stock/labels.ts'

type Show = 'all' | 'check'

const pretty = (d: LocalDate) => formatDay(d, { weekday: true })

/** "Amavasai", or the entry's own label ("Karthigai Deepam", "Thatha's day"). */
const title = (d: CalendarDay) => d.label.trim() || TYPE_NAMES[d.type]

/** Restricted days: this month to the end of next year, to confirm, fix, add or remove. */
export function CalendarScreen() {
  const { status, days, updateDay, removeDay, addDay } = useCalendar()
  const navigate = useNavigate()
  const toast = useToast()
  const clock = useClock()
  const [range] = useState(() => {
    const now = clock()
    return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: `${now.getFullYear() + 1}-12-31` }
  })
  const [show, setShow] = useState<Show>('all')
  const [editing, setEditing] = useState<CalendarDay | null>(null)
  const [adding, setAdding] = useState(false)

  const pending = toCheckCount(days, range.from)
  const months = calendarMonths(days, range.from, range.to, { toCheckOnly: show === 'check' })

  const confirm = (d: CalendarDay) => {
    updateDay(d.id, { verified: true })
    toast(`${title(d)} on ${pretty(d.date)} confirmed`, { undo: () => updateDay(d.id, { verified: false }) })
  }
  const remove = (d: CalendarDay) => {
    removeDay(d.id)
    toast(`${title(d)} on ${pretty(d.date)} removed`, {
      undo: () => addDay({ date: d.date, end_date: d.end_date, type: d.type, label: d.label, note: d.note, verified: d.verified }),
    })
  }

  return (
    <Screen
      title="Calendar"
      leading={
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
        >
          <BackIcon />
        </button>
      }
    >
      <p className="text-sm text-ink-muted">
        No non-veg (meat, fish or egg) on these days, or on any Saturday. Dates marked Check came from published
        calendars: confirm them against your panchangam, and remove the wrong one where two days are listed.
      </p>

      <div className="mt-4">
        <Segmented
          label="Show"
          options={[
            { value: 'all', label: 'All' },
            { value: 'check', label: `To check (${pending})` },
          ]}
          value={show}
          onChange={setShow}
        />
      </div>

      {status !== 'ready' ? null : months.length === 0 ? (
        <p className="mt-8 text-center text-ink-muted">{show === 'check' ? 'Nothing left to check.' : 'No restricted days yet.'}</p>
      ) : (
        months.map((m) => (
          <section key={m.key} className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-ink-muted">{m.title}</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface" aria-label={m.title}>
              {m.days.map((d) => (
                <li key={d.id} className="px-3 py-2">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {pretty(d.date)}
                        {d.end_date ? ` – ${pretty(d.end_date)}` : ''}
                      </p>
                      <p className="text-sm">{title(d)}</p>
                      {d.note && <p className="mt-0.5 text-xs text-ink-muted">{d.note}</p>}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.verified ? 'bg-leaf-fill text-leaf-strong' : 'bg-turmeric-fill text-turmeric-strong'
                      }`}
                    >
                      {d.verified ? 'Confirmed' : 'Check'}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {!d.verified && (
                      <button
                        type="button"
                        aria-label={`Confirm ${title(d)} on ${pretty(d.date)}`}
                        onClick={() => confirm(d)}
                        className="min-h-11 rounded-full bg-leaf px-4 text-sm font-medium text-bg"
                      >
                        Confirm
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Edit ${title(d)} on ${pretty(d.date)}`}
                      onClick={() => setEditing(d)}
                      className="min-h-11 rounded-full border border-line px-4 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${title(d)} on ${pretty(d.date)}`}
                      onClick={() => remove(d)}
                      className="min-h-11 rounded-full px-3 text-sm font-medium text-red"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Room to scroll the last row clear of the button. */}
      <div className="h-16" />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl justify-end px-4">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="pointer-events-auto min-h-12 rounded-full bg-leaf px-5 font-semibold text-bg shadow-lg"
        >
          + Add family day
        </button>
      </div>

      {editing && <EditDaySheet day={editing} onClose={() => setEditing(null)} />}
      {adding && <AddDaySheet onClose={() => setAdding(false)} />}
    </Screen>
  )
}

function EditDaySheet({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
  const { days, updateDay } = useCalendar()
  const toast = useToast()
  const [date, setDate] = useState(day.date)
  const [end, setEnd] = useState(day.end_date ?? '')
  const [label, setLabel] = useState(day.label)
  const [error, setError] = useState<string | null>(null)
  const stretch = day.type === 'puratasi'

  return (
    <Sheet title={`Edit ${title(day)}`} onClose={onClose}>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!date) return setError('Pick a date.')
          if (stretch && (!end || end < date)) return setError('The last day can’t be before the first.')
          if (days.some((d) => d.id !== day.id && d.type === day.type && d.date === date)) return setError(`There's already a ${TYPE_NAMES[day.type]} on that day.`)
          const before = { date: day.date, end_date: day.end_date, label: day.label, verified: day.verified }
          // Fixing a date is checking it.
          updateDay(day.id, { date, end_date: stretch ? end : null, label: label.trim(), verified: true })
          toast(`${title(day)} saved`, { undo: () => updateDay(day.id, before) })
          onClose()
        }}
      >
        <label className="block">
          <span className="text-sm font-medium">{stretch ? 'First day' : 'Date'}</span>
          <input type="date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {stretch && (
          <label className="block">
            <span className="text-sm font-medium">Last day</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={label}
            maxLength={80}
            placeholder={TYPE_NAMES[day.type]}
            onChange={(e) => setLabel(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <p className="text-xs text-ink-muted">Saving marks it confirmed.</p>
        {error && (
          <p role="alert" className="rounded-xl bg-red-fill px-3 py-2 text-sm text-red">
            {error}
          </p>
        )}
        <button type="submit" className={primaryClass}>
          Save
        </button>
        <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl font-medium">
          Cancel
        </button>
      </form>
    </Sheet>
  )
}

const ADD_TYPES: { value: CalendarType; label: string }[] = [
  { value: 'family_custom', label: 'Family day' },
  { value: 'amavasai', label: 'Amavasai' },
  { value: 'kiruthigai', label: 'Kiruthigai' },
]

function AddDaySheet({ onClose }: { onClose: () => void }) {
  const { days, addDay } = useCalendar()
  const toast = useToast()
  const [type, setType] = useState<CalendarType>('family_custom')
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Sheet title="Add a veg-only day" onClose={onClose}>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!date) return setError('Pick a date.')
          if (type === 'family_custom' && !label.trim()) return setError('Give it a name, like Thatha’s day.')
          if (days.some((d) => d.type === type && d.date === date)) return setError(`There's already a ${TYPE_NAMES[type]} on that day.`)
          const added = addDay({ date, type, label })
          toast(`${title(added)} on ${pretty(date)} added`)
          onClose()
        }}
      >
        <Segmented label="Kind of day" options={ADD_TYPES} value={type} onChange={setType} />
        <label className="block">
          <span className="text-sm font-medium">Date</span>
          <input type="date" data-autofocus value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{type === 'family_custom' ? 'Name' : 'Name (optional)'}</span>
          <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-fill px-3 py-2 text-sm text-red">
            {error}
          </p>
        )}
        <button type="submit" className={primaryClass}>
          Add day
        </button>
        <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl font-medium">
          Cancel
        </button>
      </form>
    </Sheet>
  )
}
