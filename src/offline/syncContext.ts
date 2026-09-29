import { createContext, useContext } from 'react'
import type { PrabasDb } from './db.ts'
import type { Outbox } from './outbox.ts'

export interface SyncState {
  db: PrabasDb
  outbox: Outbox
  online: boolean
  /** Changes on this device not yet saved to Supabase. */
  pendingCount: number
}

export const SyncContext = createContext<SyncState | null>(null)

export function useSync(): SyncState {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside SyncProvider')
  return ctx
}
