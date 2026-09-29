// Remembers which email a code was sent to. On iPhone, switching to Mail to read the
// code can close the installed app; this lets it reopen straight on the code step.

const KEY = 'prabas_login_pending'
/** Codes expire after an hour (Supabase default), so a pending login does too. */
export const PENDING_TTL_MS = 60 * 60_000

interface Pending {
  email: string
  sentAt: number
}

export function savePending(email: string, now = Date.now()): void {
  localStorage.setItem(KEY, JSON.stringify({ email, sentAt: now } satisfies Pending))
}

export function loadPending(now = Date.now()): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Pending | null
    if (p && typeof p.email === 'string' && now - p.sentAt < PENDING_TTL_MS) return p
  } catch {
    // Unreadable: treat as none.
  }
  clearPending()
  return null
}

export function clearPending(): void {
  localStorage.removeItem(KEY)
}
