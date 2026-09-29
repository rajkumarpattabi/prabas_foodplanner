import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSync } from '../offline/syncContext.ts'
import { HouseholdError, type HouseholdApi, type HouseholdSnapshot, type ProfilePatch } from './api.ts'
import { HouseholdContext, type HouseholdState, type HouseholdStatus } from './householdContext.ts'
import { applyPending } from './pending.ts'

const RELOAD_DEBOUNCE_MS = 300

const message = (e: unknown) => (e instanceof HouseholdError ? e.message : 'Something went wrong. Try again.')

interface Props {
  api: HouseholdApi
  userId: string
  children: ReactNode
}

/**
 * Offline-first household state:
 * 1. open from the last copy saved on this device, instantly
 * 2. refresh from Supabase, save the fresh copy, and lay unsent changes on top
 * 3. edits apply at once and go through the outbox, which retries until saved
 */
export function HouseholdProvider({ api, userId, children }: Props) {
  const { db, outbox } = useSync()
  const cacheKey = `household:${userId}`
  const [status, setStatus] = useState<HouseholdStatus>('loading')
  const [snapshot, setSnapshot] = useState<HouseholdSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest snapshot for callbacks.
  const current = useRef<HouseholdSnapshot | null>(null)
  useLayoutEffect(() => {
    current.current = snapshot
  }, [snapshot])

  const show = useCallback((next: HouseholdSnapshot) => {
    current.current = next
    setSnapshot(next)
    setError(null)
    setStatus('ready')
  }, [])

  const reload = useCallback(async () => {
    try {
      const fresh = await api.load(userId)
      await db.writeCache(cacheKey, fresh)
      show(applyPending(fresh, await outbox.pending(userId)))
    } catch (e) {
      // With data already on screen (from the cache or an earlier load), stay quiet.
      if (!current.current) {
        setError(message(e))
        setStatus('error')
      }
    }
  }, [api, userId, db, cacheKey, outbox, show])

  // Open from the cache first, then refresh from the server.
  useEffect(() => {
    let active = true
    void (async () => {
      const cached = await db.readCache<HouseholdSnapshot>(cacheKey)
      if (active && cached && !current.current) show(applyPending(cached, await outbox.pending(userId)))
      if (active) await reload()
    })()
    return () => {
      active = false
    }
  }, [db, cacheKey, outbox, userId, show, reload])

  // Refresh on live updates from the other phone, when the app returns to the
  // foreground (phones drop real-time connections while asleep), and after queued
  // changes are sent or refused.
  const householdId = snapshot?.household?.id ?? null
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }
    const unsubscribe = api.subscribe(userId, householdId, soon)
    const stopOutbox = outbox.onChange(soon)
    const onVisible = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      stopOutbox()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, outbox, userId, householdId, reload])

  /** Show an edit at once, and queue it for Supabase (which stamps who and when). */
  const edit = useCallback(
    (table: 'households' | 'profiles', match: Record<string, string>, patch: Record<string, unknown>) => {
      const op = { kind: 'update', table, match, patch, userId } as const
      const s = current.current
      if (s) show(applyPending(s, [{ ...op, id: 'local', createdAt: '', attempts: 0 }]))
      void outbox.enqueue(op)
    },
    [outbox, userId, show],
  )

  const updateProfile = useCallback(
    (patch: ProfilePatch) => edit('profiles', { user_id: userId }, patch),
    [edit, userId],
  )

  const renameHousehold = useCallback(
    (name: string) => {
      const hid = current.current?.household?.id
      if (hid) edit('households', { id: hid }, { name })
    },
    [edit],
  )

  const recordDriveBackup = useCallback(
    (at: string) => {
      const hid = current.current?.household?.id
      if (hid) edit('households', { id: hid }, { drive_backup_at: at })
    },
    [edit],
  )

  /** Starting or joining needs the server, so these run online and report errors inline. */
  const setUp = useCallback(
    async (run: () => Promise<void>, displayName: string) => {
      try {
        await run()
        const name = displayName.trim()
        if (name && name !== current.current?.me.display_name) updateProfile({ display_name: name })
        await reload()
        return null
      } catch (e) {
        return message(e)
      }
    },
    [reload, updateProfile],
  )

  const createHousehold = useCallback(
    (name: string, displayName: string) => setUp(() => api.createHousehold(name.trim()), displayName),
    [api, setUp],
  )

  const joinHousehold = useCallback(
    (code: string, displayName: string) => setUp(() => api.joinHousehold(code), displayName),
    [api, setUp],
  )

  const rotateJoinCode = useCallback(async () => {
    try {
      const code = await api.rotateJoinCode()
      const s = current.current
      if (s?.household) show({ ...s, household: { ...s.household, join_code: code } })
      return null
    } catch (e) {
      return message(e)
    }
  }, [api, show])

  const value = useMemo<HouseholdState>(
    () => ({
      status,
      snapshot,
      error,
      reload,
      createHousehold,
      joinHousehold,
      rotateJoinCode,
      renameHousehold,
      updateProfile,
      recordDriveBackup,
    }),
    [
      status,
      snapshot,
      error,
      reload,
      createHousehold,
      joinHousehold,
      rotateJoinCode,
      renameHousehold,
      updateProfile,
      recordDriveBackup,
    ],
  )
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}
