import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from './authContext.ts'
import { clearPending, loadPending, savePending } from './pendingLogin.ts'

const RESEND_WAIT_S = 60
const CODE_LENGTH = 6

/** Email, then 6-digit code. The form sits in the lower half, within thumb reach. */
export function LoginScreen() {
  const { sendCode, verifyCode } = useAuth()
  const [pending] = useState(() => loadPending())
  const [step, setStep] = useState<'email' | 'code'>(pending ? 'code' : 'email')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(() =>
    pending ? Math.max(0, RESEND_WAIT_S - Math.floor((Date.now() - pending.sentAt) / 1000)) : 0,
  )

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!address.includes('@')) {
      setError('Check the email address.')
      return
    }
    setBusy(true)
    setError(null)
    const err = await sendCode(address)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    savePending(address)
    setEmail(address)
    setCode('')
    setStep('code')
    setResendIn(RESEND_WAIT_S)
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault()
    if (code.length !== CODE_LENGTH) return
    setBusy(true)
    setError(null)
    const err = await verifyCode(email, code)
    setBusy(false)
    if (err) setError(err)
    else clearPending()
  }

  function changeEmail() {
    clearPending()
    setStep('email')
    setCode('')
    setError(null)
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="h-20 w-20 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-semibold">PRABAS</h1>
        <p className="mt-1 text-ink-muted">What do we cook next?</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={send} className="flex flex-col gap-3" noValidate>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base"
            placeholder="you@example.com"
          />
          <ErrorLine error={error} />
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-xl bg-leaf font-semibold text-surface disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <p className="text-center text-sm text-ink-muted">We'll email you a 6-digit code.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-sm font-medium">
            Code sent to <span className="font-semibold">{email}</span>
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            className="min-h-14 rounded-xl border border-line bg-surface px-4 text-center text-2xl tracking-[0.5em]"
            placeholder="••••••"
          />
          <ErrorLine error={error} />
          <button
            type="submit"
            disabled={busy || code.length !== CODE_LENGTH}
            className="min-h-12 rounded-xl bg-leaf font-semibold text-surface disabled:opacity-60"
          >
            {busy ? 'Checking…' : 'Log in'}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={changeEmail} className="min-h-11 text-ink-muted">
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || resendIn > 0}
              className="min-h-11 font-medium text-leaf disabled:text-ink-muted"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-fill px-3 py-2 text-sm text-red">
      <span aria-hidden="true">!</span>
      {error}
    </p>
  )
}
