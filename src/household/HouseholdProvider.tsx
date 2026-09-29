import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../components/toastContext.ts'
import { HouseholdError, type HouseholdApi, type HouseholdSnapshot, type ProfilePatch } from './api.ts'
import { HouseholdContext, type HouseholdState, type HouseholdStatus } from './householdContext.ts'

const RELOAD_DEBOUNCE_MS = 300

const message = (e: unknown) => (e instanceof HouseholdError ? e.message : 'Something went wrong. Try again.')

interface Props {
  api: HouseholdApi
  userId: string
  children: ReactNode
}

export function HouseholdProvider({ api, userId, children }: Props) {
  const toast = useToast()
  const [status, setStatus] = useState<HouseholdStatus>('loading')
  const [snapshot, setSnapshot] = useState<HouseholdSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest snapshot for callbacks, so optimistic updates can roll back to it.
  const current = useRef<HouseholdSnapshot | null>(null)
  useLayoutEffect(() => {
    current.current = snapshot
  }, [snapshot])

  const reload = useCallback(async () => {
    try {
      const next = await api.load(userId)
      setSnapshot(next)
      setError(null)
      setStatus('ready')
    } catch (e) {
      // With data already on screen, a failed background refresh is silent.
      if (!current.current) {
        setError(message(e))
        setStatus('error')
      }
    }
  }, [api, userId])

  // First load. (Later loads come from the live-update effect below.)
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0)
    return () => clearTimeout(t)
  }, [reload])

  // Live updates from the other phone, plus a refresh when the app comes back to
  // the foreground or back online (phones drop real-time connections while asleep).
  const householdId = snapshot?.household?.id ?? null
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), RELOAD_DEBOUNCE_MS)
    }
    const unsubscribe = api.subscribe(userId, householdId, soon)
    const onVisible = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', soon)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', soon)
    }
  }, [api, userId, householdId, reload])

  const setUp = useCallback(
    async (run: () => Promise<void>, displayName: string) => {
      try {
        const name = displayName.trim()
        if (name && name !== current.current?.me.display_name) {
          await api.updateProfile(userId, { display_name: name })
        }
        await run()
        await reload()
        return null
      } catch (e) {
        return message(e)
      }
    },
    [api, userId, reload],
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
      setSnapshot((s) => (s?.household ? { ...s, household: { ...s.household, join_code: code } } : s))
      return null
    } catch (e) {
      return message(e)
    }
  }, [api])

  /** Show a change at once, save it, and put the old state back if saving fails. */
  const optimistic = useCallback(
    (apply: (s: HouseholdSnapshot) => HouseholdSnapshot, save: () => Promise<void>) => {
      const before = current.current
      if (!before) return
      const next = apply(before)
      current.current = next
      setSnapshot(next)
      save().then(
        () => void reload(),
        (e) => {
          setSnapshot(before)
          toast(`Not saved. ${message(e)}`)
        },
      )
    },
    [reload, toast],
  )

  const renameHousehold = useCallback(
    (name: string) => {
      const hid = current.current?.household?.id
      if (!hid) return
      optimistic(
        (s) => ({ ...s, household: s.household && { ...s.household, name } }),
        () => api.renameHousehold(hid, name),
      )
    },
    [api, optimistic],
  )

  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      optimistic(
        (s) => ({
          ...s,
          me: { ...s.me, ...patch },
          members: s.members.map((m) =>
            m.userId === userId && m.profile ? { ...m, profile: { ...m.profile, ...patch } } : m,
          ),
        }),
        () => api.updateProfile(userId, patch),
      )
    },
    [api, optimistic, userId],
  )

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
    }),
    [status, snapshot, error, reload, createHousehold, joinHousehold, rotateJoinCode, renameHousehold, updateProfile],
  )
  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}
