// Reminders, as stored (see supabase/migrations/0014_reminders.sql). The phones work
// out what's coming up and write it here; the send-reminders function sends what's due.

import type { LocalDate } from '../lib/dates.ts'

export const REMINDER_TYPES = ['prep', 'stage', 'nonveg', 'low', 'expiry'] as const
export type ReminderType = (typeof REMINDER_TYPES)[number]

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  prep: 'Night-before prep',
  stage: 'Batch steps',
  nonveg: 'Fish or meat to buy',
  low: 'Staples running low',
  expiry: 'Batches about to finish',
}

/** Which tab a tap opens. */
export type ReminderUrl = '/plan' | '/shop' | '/stock'

/** A reminder as worked out on the phone. */
export interface ReminderDraft {
  /** Stable, so both phones write the same reminder: "stage:<batch>:1". */
  key: string
  type: ReminderType
  title: string
  body: string
  url: ReminderUrl
  /** An exact time (a batch step) … */
  due_at: string | null
  /** … or a day, sent at each person's evening time. */
  due_date: LocalDate | null
  at_evening: boolean
  /** Not sent after this. */
  expires_at: string
}

export interface Reminder extends ReminderDraft {
  /** `<household id>:<key>` */
  id: string
  household_id: string
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

/** One person's reminder settings. */
export interface ReminderSettings {
  user_id: string
  household_id: string
  types: ReminderType[]
  /** "20:30", in their own time zone. */
  evening_time: string
  quiet_from: string
  quiet_to: string
  /** "Asia/Kolkata" */
  timezone: string
  created_at: string
  updated_at: string
}

export const DEFAULT_SETTINGS = {
  types: [...REMINDER_TYPES],
  evening_time: '20:30',
  quiet_from: '22:00',
  quiet_to: '06:30',
  timezone: 'Asia/Kolkata',
} as const

/** One phone or browser that can be sent reminders. */
export interface PushSubscriptionRow {
  id: string
  household_id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  /** "iPhone", "Android phone". */
  label: string
  created_at: string
  last_used_at: string | null
}

export const reminderId = (householdId: string, key: string) => `${householdId}:${key}`
