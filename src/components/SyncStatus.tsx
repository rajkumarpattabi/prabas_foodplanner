import { useSync } from '../offline/syncContext.ts'

/** A slim line at the top when offline or when changes are waiting to be saved. */
export function SyncStatus() {
  const { online, pendingCount } = useSync()
  if (online && pendingCount === 0) return null

  const waiting = pendingCount === 1 ? '1 change waiting' : `${pendingCount} changes waiting`
  const text = online ? `Saving ${waiting.replace(' waiting', '')}…` : pendingCount ? `Offline · ${waiting}` : 'Offline'

  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-turmeric-fill px-4 py-1.5 text-sm text-turmeric-strong">
      <span aria-hidden="true">{online ? '↻' : '○'}</span>
      {text}
    </div>
  )
}
