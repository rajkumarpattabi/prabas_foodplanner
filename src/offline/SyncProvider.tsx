import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useToast } from '../components/toastContext.ts'
import type { Sync } from './setup.ts'
import { SyncContext } from './syncContext.ts'

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

interface Props {
  sync: Sync
  userId: string
  children: ReactNode
}

/** Sends the signed-in user's queued changes whenever there's a chance they'll get through. */
export function SyncProvider({ sync, userId, children }: Props) {
  const { db, outbox } = sync
  const toast = useToast()
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const pendingCount = useLiveQuery(() => db.outbox.where('userId').equals(userId).count(), [db, userId], 0)

  useEffect(() => {
    sync.setUser(userId)
    const kick = () => void outbox.flush()
    const onVisible = () => document.visibilityState === 'visible' && kick()
    kick()
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', onVisible)
    const stopReject = outbox.onReject(() => toast("A change couldn't be saved, so it was undone."))
    return () => {
      sync.setUser(null)
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', onVisible)
      stopReject()
    }
  }, [sync, outbox, userId, toast])

  const value = useMemo(() => ({ db, outbox, online, pendingCount }), [db, outbox, online, pendingCount])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
