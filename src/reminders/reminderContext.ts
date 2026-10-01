import { createContext, useContext } from 'react'
import type { Reminder, ReminderDraft, ReminderSettings } from './types.ts'

export type ReminderStatus = 'loading' | 'error' | 'ready'

export type SettingsPatch = Partial<Pick<ReminderSettings, 'types' | 'evening_time' | 'quiet_from' | 'quiet_to' | 'timezone'>>

/** This person's settings, with the defaults filled in until they're saved. */
export type EffectiveSettings = Pick<ReminderSettings, 'types' | 'evening_time' | 'quiet_from' | 'quiet_to' | 'timezone'> & { saved: boolean }

export interface ReminderState {
  status: ReminderStatus
  reminders: Reminder[]
  settings: EffectiveSettings
  saveSettings: (patch: SettingsPatch) => void
  /** Write new and changed reminders, and remove ones that no longer apply. */
  applyChanges: (changes: { upserts: (ReminderDraft & { id: string; household_id: string })[]; deletes: string[] }) => void
  reload: () => Promise<void>
}

export const ReminderContext = createContext<ReminderState | null>(null)

export function useReminders(): ReminderState {
  const ctx = useContext(ReminderContext)
  if (!ctx) throw new Error('useReminders must be used inside ReminderProvider')
  return ctx
}
