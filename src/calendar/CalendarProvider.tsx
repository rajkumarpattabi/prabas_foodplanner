import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { CalendarApi } from './api.ts'
import { CalendarContext, type CalendarPatch, type CalendarState, type CalendarStatus, type NewCalendarDay } from './calendarContext.ts'
import type { CalendarDay } from './types.ts'

interface Props {
  api: CalendarApi
  householdId: string
  userId: string
  children: ReactNode
}

/** Offline-first restricted days (see useTableSync), and the ways to change them. */
export function CalendarProvider({ api, householdId, userId, children }: Props) {
  const { db } = useSync()
  const tables = useMemo(() => ({ calendar_days: db.calendar_days }), [db])
  const load = useCallback(async () => ({ calendar_days: await api.load(householdId) }), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, error, reload, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `calendar:${householdId}`,
    tables,
    load,
    subscribe,
  })

  const days = useLiveQuery(() => db.calendar_days.where('household_id').equals(householdId).toArray(), [db, householdId])

  const addDay = useCallback(
    (input: NewCalendarDay): CalendarDay => {
      const now = new Date().toISOString()
      const day: CalendarDay = {
        id: crypto.randomUUID(),
        household_id: householdId,
        date: input.date,
        end_date: input.end_date ?? null,
        type: input.type,
        label: input.label?.trim() ?? '',
        verified: input.verified ?? true,
        note: input.note ?? null,
        created_by: userId,
        created_at: now,
        updated_by: userId,
        updated_at: now,
      }
      // Supabase stamps the times.
      const { created_at: _c, updated_at: _u, ...row } = day
      void save('calendar_days', [day], [{ kind: 'insert', table: 'calendar_days', row, userId }])
      return day
    },
    [householdId, userId, save],
  )

  const updateDay = useCallback(
    (id: string, patch: CalendarPatch) => {
      void (async () => {
        const current = await db.calendar_days.get(id)
        if (!current) return
        const next = { ...current, ...patch, updated_by: userId, updated_at: new Date().toISOString() }
        await save('calendar_days', [next], [{ kind: 'update', table: 'calendar_days', match: { id }, patch, userId }])
      })()
    },
    [db, userId, save],
  )

  const removeDay = useCallback((id: string) => void remove('calendar_days', id), [remove])

  const ready = loaded === true && days !== undefined
  const status: CalendarStatus = ready ? 'ready' : loaded === false && error ? 'error' : 'loading'
  const value = useMemo<CalendarState>(
    () => ({ status, error, days: days ?? [], addDay, updateDay, removeDay, reload }),
    [status, error, days, addDay, updateDay, removeDay, reload],
  )
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>
}
