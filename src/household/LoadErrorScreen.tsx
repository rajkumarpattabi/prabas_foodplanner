import { useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import { useHousehold } from './householdContext.ts'

/** Shown only when the household has never loaded on this device (for example, first open offline). */
export function LoadErrorScreen() {
  const { error, reload } = useHousehold()
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-xl font-semibold">Couldn't load your household</h1>
        <p className="mt-2 text-ink-muted">{error}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await reload()
          setBusy(false)
        }}
        className="min-h-12 rounded-xl bg-leaf font-semibold text-surface disabled:opacity-60"
      >
        {busy ? 'Trying…' : 'Try again'}
      </button>
      <button type="button" onClick={() => void signOut()} className="mt-2 min-h-11 text-sm text-ink-muted">
        Log out
      </button>
    </div>
  )
}
