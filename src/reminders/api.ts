import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { Reminder, ReminderSettings } from './types.ts'

/** A failure loading reminders (for example, offline). */
export class ReminderError extends Error {}

export interface ReminderApi {
  /** The household's upcoming reminders. Throws ReminderError when it can't. */
  load(householdId: string): Promise<Reminder[]>
  /** This person's settings, or null if never saved. */
  loadSettings(userId: string): Promise<ReminderSettings | null>
  /** Calls onChange with each reminder the other phone writes or removes. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string | null) => (t === null ? null : new Date(t).toISOString())
/** Postgres sends times as "20:30:00". */
const hhmm = (t: string) => t.slice(0, 5)

export function toReminder(row: Record<string, unknown>): Reminder {
  const r = row as unknown as Reminder
  return { ...r, due_at: iso(r.due_at), expires_at: iso(r.expires_at)!, created_at: iso(r.created_at)!, updated_at: iso(r.updated_at)! }
}

export function toSettings(row: Record<string, unknown>): ReminderSettings {
  const r = row as unknown as ReminderSettings
  return { ...r, evening_time: hhmm(r.evening_time), quiet_from: hhmm(r.quiet_from), quiet_to: hhmm(r.quiet_to) }
}

export function supabaseReminderApi(sb: Supabase): ReminderApi {
  return {
    async load(householdId) {
      try {
        return (await readAll(sb, 'reminders', householdId, (e) => new ReminderError(e.message))).map(toReminder)
      } catch (e) {
        throw e instanceof ReminderError ? e : new ReminderError(String((e as Error)?.message ?? e))
      }
    },

    async loadSettings(userId) {
      const { data, error } = await sb.from('reminder_settings').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw new ReminderError(error.message)
      return data ? toSettings(data as unknown as Record<string, unknown>) : null
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`reminders:${householdId}`)
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table: 'reminders', filter }, (p) =>
          onChange({ table: 'reminders', row: toReminder(p.new) }),
        )
      }
      // Deletes can't be filtered and carry only the id: one from another household matches nothing here.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reminders' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) onChange({ table: 'reminders', deletedId: id })
      })
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
