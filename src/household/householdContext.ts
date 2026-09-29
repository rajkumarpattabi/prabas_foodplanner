import { createContext, useContext } from 'react'
import type { HouseholdSnapshot, ProfilePatch } from './api.ts'

export type HouseholdStatus = 'loading' | 'error' | 'ready'

export interface HouseholdState {
  status: HouseholdStatus
  /** Present once loaded; kept during background reloads. */
  snapshot: HouseholdSnapshot | null
  /** Why the first load failed (status "error"). */
  error: string | null
  reload: () => Promise<void>
  /** Resolve to a readable error message, or null on success. */
  createHousehold: (name: string, displayName: string) => Promise<string | null>
  joinHousehold: (code: string, displayName: string) => Promise<string | null>
  rotateJoinCode: () => Promise<string | null>
  /** Applied at once; reverted with a toast if saving fails. */
  renameHousehold: (name: string) => void
  updateProfile: (patch: ProfilePatch) => void
  /** Tell everyone in the household when Drive backup last succeeded. */
  recordDriveBackup: (at: string) => void
}

export const HouseholdContext = createContext<HouseholdState | null>(null)

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used inside HouseholdProvider')
  return ctx
}

/** For screens inside the app shell, where a household always exists. */
export function useReadyHousehold() {
  const { snapshot, ...rest } = useHousehold()
  if (!snapshot?.household) throw new Error('useReadyHousehold needs a loaded household')
  return { ...rest, me: snapshot.me, household: snapshot.household, members: snapshot.members }
}
