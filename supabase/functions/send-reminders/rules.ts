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

export interface ReminderRow extends DueReminder {
  id: string
  household_id: string
  title: string
  body: string
  url: string
}

export interface Device {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export interface Send {
  reminder: ReminderRow
  user_id: string
  devices: Device[]
}

/** Settings for someone who has never saved theirs. */
export const DEFAULT_PERSON: PersonSettings = {
  types: ['prep', 'stage', 'nonveg', 'low', 'expiry'],
  evening_time: '20:30',
  quiet_from: '22:00',
  quiet_to: '06:30',
  timezone: 'Asia/Kolkata',
}

/**
 * Who should be sent which reminder now: every member of the reminder's household
 * with a device, who hasn't had it, whose settings say it's time.
 */
export function planSends({
  reminders,
  members,
  settings,
  devices,
  delivered,
  now,
}: {
  reminders: readonly ReminderRow[]
  members: readonly { household_id: string; user_id: string }[]
  settings: ReadonlyMap<string, PersonSettings>
  devices: readonly Device[]
  /** "<reminder id>|<user id>" for each one already sent. */
  delivered: ReadonlySet<string>
  now: Date
}): Send[] {
  const out: Send[] = []
  for (const r of reminders) {
    for (const m of members) {
      if (m.household_id !== r.household_id || delivered.has(`${r.id}|${m.user_id}`)) continue
      const theirs = devices.filter((d) => d.user_id === m.user_id)
      if (!theirs.length) continue
      if (decide(r, settings.get(m.user_id) ?? DEFAULT_PERSON, now) === 'send') out.push({ reminder: r, user_id: m.user_id, devices: theirs })
    }
  }
  return out
}
