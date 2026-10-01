// Restricted days, as stored (see supabase/migrations/0009_calendar.sql).

import type { LocalDate } from '../lib/dates.ts'

export const CALENDAR_TYPES = ['amavasai', 'kiruthigai', 'puratasi', 'family_custom'] as const
export type CalendarType = (typeof CALENDAR_TYPES)[number]

/** A day (or, for Puratasi, a stretch of days) with no non-veg. Saturdays are a rule, not entries. */
export interface CalendarDay {
  id: string
  household_id: string
  date: LocalDate
  /** The last day, for Puratasi; null for a single day. */
  end_date: LocalDate | null
  type: CalendarType
  label: string
  /** Checked against a panchangam by someone at home. Unverified days still restrict. */
  verified: boolean
  /** Where it came from, and whether the sources agreed. */
  note: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export const TYPE_NAMES: Record<CalendarType, string> = {
  amavasai: 'Amavasai',
  kiruthigai: 'Kiruthigai',
  puratasi: 'Puratasi',
  family_custom: 'Family day',
}
