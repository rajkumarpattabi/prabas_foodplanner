import { readAll } from '../lib/readAll.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import type { CalendarDay } from './types.ts'

/** A failure loading the calendar (for example, offline). */
export class CalendarError extends Error {}

export interface CalendarApi {
  /** Every restricted day in the household. Throws CalendarError when it can't. */
  load(householdId: string): Promise<CalendarDay[]>
  /** Calls onChange with each day added, changed or deleted. */
  subscribe(householdId: string, onChange: (change: TableChange) => void): () => void
}

const iso = (t: string) => new Date(t).toISOString()

export function toCalendarDay(row: Record<string, unknown>): CalendarDay {
  const r = row as unknown as CalendarDay
  return { ...r, label: r.label ?? '', created_at: iso(r.created_at), updated_at: iso(r.updated_at) }
}

export function supabaseCalendarApi(sb: Supabase): CalendarApi {
  return {
    async load(householdId) {
      try {
        return (await readAll(sb, 'calendar_days', householdId, (e) => new CalendarError(e.message))).map(toCalendarDay)
      } catch (e) {
        throw e instanceof CalendarError ? e : new CalendarError(String((e as Error)?.message ?? e))
      }
    },

    subscribe(householdId, onChange) {
      const filter = `household_id=eq.${householdId}`
      const channel = sb.channel(`calendar:${householdId}`)
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on('postgres_changes', { event, schema: 'public', table: 'calendar_days', filter }, (p) =>
          onChange({ table: 'calendar_days', row: toCalendarDay(p.new) }),
        )
      }
      // Deletes can't be filtered and carry only the id: one from another household matches nothing here.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'calendar_days' }, (p) => {
        const id = (p.old as { id?: string }).id
        if (id) onChange({ table: 'calendar_days', deletedId: id })
      })
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
