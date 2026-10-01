import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { NewOp } from '../offline/outbox.ts'
import { useSync } from '../offline/syncContext.ts'
import { useTableSync, type TableChange } from '../offline/useTableSync.ts'
import type { ReminderApi } from './api.ts'
import { ReminderContext, type EffectiveSettings, type ReminderState, type ReminderStatus, type SettingsPatch } from './reminderContext.ts'
import { DEFAULT_SETTINGS, type Reminder, type ReminderSettings } from './types.ts'

interface Props {
  api: ReminderApi
  householdId: string
  userId: string
  children: ReactNode
}

/** The phone's own time zone, if it says. */
const phoneZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_SETTINGS.timezone
  } catch {
    return DEFAULT_SETTINGS.timezone
  }
}

/**
 * The household's reminders (offline-first, see useTableSync), and this person's
 * reminder settings: one row, kept in the local cache and saved through the outbox.
 */
export function ReminderProvider({ api, householdId, userId, children }: Props) {
  const { db, outbox } = useSync()
  const tables = useMemo(() => ({ reminders: db.reminders }), [db])
  const load = useCallback(async () => ({ reminders: await api.load(householdId) }), [api, householdId])
  const subscribe = useCallback((onChange: (c: TableChange) => void) => api.subscribe(householdId, onChange), [api, householdId])
  const { loaded, reload: reloadTable, save, remove } = useTableSync({
    householdId,
    userId,
    cacheKey: `reminders:${householdId}`,
    tables,
    load,
    subscribe,
  })
  const reminders = useLiveQuery(() => db.reminders.where('household_id').equals(householdId).toArray(), [db, householdId])

  // Settings: from the cache at once, then from the server (unless a change is waiting to go).
  const settingsKey = `reminder-settings:${userId}`
  const [stored, setStored] = useState<ReminderSettings | null | undefined>(undefined)
  const loadSettings = useCallback(async () => {
    const cached = await db.readCache<ReminderSettings>(settingsKey)
    setStored((s) => (s === undefined ? cached : s))
    try {
      const server = await api.loadSettings(userId)
      const waiting = (await db.outbox.where('userId').equals(userId).toArray()).some((op) => op.table === 'reminder_settings')
      if (!waiting) {
        setStored(server)
        await db.writeCache(settingsKey, server)
      }
    } catch {
      // Offline: the cached settings stand.
    }
  }, [api, db, userId, settingsKey])
  useEffect(() => {
    const run = loadSettings
    const timer = window.setTimeout(() => void run(), 0)
    return () => window.clearTimeout(timer)
  }, [loadSettings])

  const settings = useMemo<EffectiveSettings>(
    () =>
      stored
        ? { types: stored.types, evening_time: stored.evening_time, quiet_from: stored.quiet_from, quiet_to: stored.quiet_to, timezone: stored.timezone, saved: true }
        : { ...DEFAULT_SETTINGS, types: [...DEFAULT_SETTINGS.types], timezone: phoneZone(), saved: false },
    [stored],
  )

  const saveSettings = useCallback(
    (patch: SettingsPatch) => {
      const now = new Date().toISOString()
      const base = stored ?? { ...DEFAULT_SETTINGS, types: [...DEFAULT_SETTINGS.types], timezone: phoneZone(), user_id: userId, household_id: householdId, created_at: now, updated_at: now }
      const next: ReminderSettings = { ...base, ...patch, updated_at: now }
      setStored(next)
      void (async () => {
        await db.writeCache(settingsKey, next)
        const { created_at: _c, updated_at: _u, ...row } = { ...next, created_by: userId }
        // Made once (ignored if it's there already), then changed.
        await outbox.enqueue({ kind: 'insert', table: 'reminder_settings', row, onConflict: 'user_id', userId })
        await outbox.enqueue({ kind: 'update', table: 'reminder_settings', match: { user_id: userId }, patch, userId })
      })()
    },
    [stored, userId, householdId, db, outbox, settingsKey],
  )

  const applyChanges = useCallback<ReminderState['applyChanges']>(
    ({ upserts, deletes }) => {
      const now = new Date().toISOString()
      const current = new Map((reminders ?? []).map((r) => [r.id, r]))
      if (upserts.length) {
        const rows: Reminder[] = upserts.map((u) => {
          const { key: _k, ...fields } = u
          const was = current.get(u.id)
          return { ...(was ?? { created_by: userId, created_at: now }), ...fields, key: u.key, updated_by: userId, updated_at: now } as Reminder
        })
        // Each one made (ignored if the other phone made it first), then set to this content.
        const ops: NewOp[] = upserts.flatMap((u) => {
          const { key: _k, ...fields } = u
          return [
            { kind: 'insert' as const, table: 'reminders', row: { ...fields, created_by: userId, updated_by: userId }, userId },
            {
              kind: 'update' as const,
              table: 'reminders',
              match: { id: u.id },
              patch: { type: u.type, title: u.title, body: u.body, url: u.url, due_at: u.due_at, due_date: u.due_date, at_evening: u.at_evening, expires_at: u.expires_at },
              userId,
            },
          ]
        })
        void save('reminders', rows, ops)
      }
      for (const id of deletes) void remove('reminders', id)
    },
    [reminders, userId, save, remove],
  )

  const reload = useCallback(async () => {
    await Promise.all([reloadTable(), loadSettings()])
  }, [reloadTable, loadSettings])

  const ready = loaded === true && reminders !== undefined && stored !== undefined
  const status: ReminderStatus = ready ? 'ready' : 'loading'
  const value = useMemo<ReminderState>(
    () => ({ status, reminders: reminders ?? [], settings, saveSettings, applyChanges, reload }),
    [status, reminders, settings, saveSettings, applyChanges, reload],
  )
  return <ReminderContext.Provider value={value}>{children}</ReminderContext.Provider>
}
