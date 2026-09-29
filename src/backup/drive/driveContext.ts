import { createContext, useContext, useSyncExternalStore } from 'react'
import { readStatus, type DriveDeps, type DriveStatus } from './driveBackup.ts'

/** Google sign-in and Drive calls; null when this build has no Google client id. */
export const DriveDepsContext = createContext<DriveDeps | null>(null)

export const useDriveDeps = () => useContext(DriveDepsContext)

// The status lives in local storage (written by driveBackup.ts). Components re-read it
// after notifyDriveStatus(), so the auto-backup and the Settings screen stay in step.
const EVENT = 'prabas-gd-change'
let cached: DriveStatus = readStatus()
let cachedKey = JSON.stringify(cached)

export function notifyDriveStatus(): void {
  window.dispatchEvent(new Event(EVENT))
}

function snapshot(): DriveStatus {
  const next = readStatus()
  const key = JSON.stringify(next)
  if (key !== cachedKey) {
    cached = next
    cachedKey = key
  }
  return cached
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useDriveStatus(): DriveStatus {
  return useSyncExternalStore(subscribe, snapshot)
}
