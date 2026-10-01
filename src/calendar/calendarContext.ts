import { createContext, useContext } from 'react'
import type { LocalDate } from '../lib/dates.ts'
import type { CalendarDay, CalendarType } from './types.ts'

export type CalendarStatus = 'loading' | 'error' | 'ready'

export interface NewCalendarDay {
  date: LocalDate
  type: CalendarType
  label?: string
  end_date?: LocalDate | null
  note?: string | null
}

export type CalendarPatch = Partial<Pick<CalendarDay, 'date' | 'end_date' | 'label' | 'verified' | 'note'>>

export interface CalendarState {
  status: CalendarStatus
  error: string | null
  days: CalendarDay[]
  /** Added here by someone at home, so it starts confirmed. */
  addDay: (day: NewCalendarDay) => CalendarDay
  updateDay: (id: string, patch: CalendarPatch) => void
  removeDay: (id: string) => void
  reload: () => Promise<void>
}

export const CalendarContext = createContext<CalendarState | null>(null)

export function useCalendar(): CalendarState {
  const ctx = useContext(CalendarContext)
  if (!ctx) throw new Error('useCalendar must be used inside CalendarProvider')
  return ctx
}
