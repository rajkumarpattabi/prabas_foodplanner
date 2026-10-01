// Who gets which reminder, and when: pure, so it's tested with the app's tests
// (src/reminders/rules.test.ts) and runs unchanged in the Edge Function. No imports.

export interface DueReminder {
  type: string
  due_at: string | null
  /** "YYYY-MM-DD": sent at the person's evening time that day. */
  due_date: string | null
  at_evening: boolean
  expires_at: string
}

export interface PersonSettings {
  types: string[]
  /** "HH:MM" */
  evening_time: string
  quiet_from: string
  quiet_to: string
  timezone: string
}

/** send: now. wait: later (not due, or quiet hours). drop: never (out of date, or turned off). */
export type Decision = 'send' | 'wait' | 'drop'

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The local date and minutes after midnight in a time zone. */
export function localParts(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Inside quiet hours (which may run past midnight, 22:00 to 06:30)? */
export function inQuietHours(mins: number, from: string, to: string): boolean {
  const f = minutes(from)
  const t = minutes(to)
  if (f === t) return false
  return f < t ? mins >= f && mins < t : mins >= f || mins < t
}

export function decide(reminder: DueReminder, settings: PersonSettings, now: Date): Decision {
  if (now.getTime() >= new Date(reminder.expires_at).getTime()) return 'drop'
  if (!settings.types.includes(reminder.type)) return 'drop'
  const local = localParts(now, settings.timezone)
  const due = reminder.at_evening
    ? reminder.due_date !== null && (local.date > reminder.due_date || (local.date === reminder.due_date && local.minutes >= minutes(settings.evening_time)))
    : reminder.due_at !== null && now.getTime() >= new Date(reminder.due_at).getTime()
  if (!due) return 'wait'
  if (inQuietHours(local.minutes, settings.quiet_from, settings.quiet_to)) return 'wait'
  return 'send'
}
