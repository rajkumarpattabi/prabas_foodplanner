import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext.ts'
import { Segmented } from '../components/Segmented.tsx'
import { useHousehold } from './householdContext.ts'
import { formatJoinCode, JOIN_CODE_LENGTH, normaliseJoinCode } from './joinCode.ts'

type Mode = 'start' | 'join'

const MODES: { value: Mode; label: string }[] = [
  { value: 'start', label: 'Start a household' },
  { value: 'join', label: 'Join with a code' },
]

const inputClass = 'min-h-12 rounded-xl border border-line bg-surface px-4 text-base'
const buttonClass = 'min-h-12 rounded-xl bg-leaf font-semibold text-surface disabled:opacity-60'

/** First login: name yourself, then start a household or join one with a code. */
export function OnboardingScreen() {
  const { snapshot, createHousehold, joinHousehold } = useHousehold()
  const { signOut } = useAuth()
  const [mode, setMode] = useState<Mode>('start')
  const [displayName, setDisplayName] = useState(snapshot?.me.display_name ?? '')
  const [householdName, setHouseholdName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOk = displayName.trim().length > 0
  const canSubmit =
    nameOk && (mode === 'start' ? householdName.trim().length > 0 : normaliseJoinCode(code).length === JOIN_CODE_LENGTH)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    const err =
      mode === 'start' ? await createHousehold(householdName, displayName) : await joinHousehold(code, displayName)
    setBusy(false)
    setError(err)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-1 flex-col px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-semibold">Set up your household</h1>
        <p className="mt-2 text-ink-muted">
          Everyone in a household shares the same plan, stock, and dishes. One person starts it, and the others join
          with a code from Settings.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="display-name" className="text-sm font-medium">
          Your name
        </label>
        <input
          id="display-name"
          autoComplete="given-name"
          maxLength={40}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className={inputClass}
          placeholder="Shown as “Updated by …”"
        />

        <div className="mt-2">
          <Segmented label="Household" options={MODES} value={mode} onChange={(m) => (setMode(m), setError(null))} />
        </div>

        {mode === 'start' ? (
          <>
            <label htmlFor="household-name" className="text-sm font-medium">
              Household name
            </label>
            <input
              id="household-name"
              maxLength={60}
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              className={inputClass}
              placeholder="For example, Prabas home"
            />
          </>
        ) : (
          <>
            <label htmlFor="join-code" className="text-sm font-medium">
              Join code
            </label>
            <input
              id="join-code"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={formatJoinCode(code)}
              onChange={(e) => setCode(normaliseJoinCode(e.target.value).slice(0, JOIN_CODE_LENGTH))}
              className={`${inputClass} text-center text-xl tracking-[0.3em] uppercase`}
              placeholder="K7M-4QP"
            />
          </>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-fill px-3 py-2 text-sm text-red">
            <span aria-hidden="true">!</span>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !canSubmit} className={buttonClass}>
          {busy ? 'Setting up…' : mode === 'start' ? 'Start household' : 'Join household'}
        </button>
        <button type="button" onClick={() => void signOut()} className="min-h-11 text-sm text-ink-muted">
          Log out
        </button>
      </form>
    </div>
  )
}
