import type { AuthError, Session } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { AuthApi } from '../auth/authContext.ts'

type Listener = (event: string, session: Session | null) => void

export const TEST_CODE = '123456'

export function fakeSession(email = 'raj@example.test'): Session {
  return {
    access_token: 'test',
    refresh_token: 'test',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1', email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
  } as Session
}

/** An in-memory stand-in for supabase.auth. Code TEST_CODE signs in; anything else fails. */
export function fakeAuth(options: { session?: Session | null; sendError?: Partial<AuthError> } = {}) {
  let session = options.session ?? null
  const listeners = new Set<Listener>()
  const emit = (event: string) => listeners.forEach((l) => l(event, session))

  const api = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    }),
    signInWithOtp: vi.fn(async () => ({
      data: {},
      error: options.sendError ? ({ message: 'error', ...options.sendError } as AuthError) : null,
    })),
    verifyOtp: vi.fn(async ({ email, token }: { email: string; token: string }) => {
      if (token !== TEST_CODE) {
        return { data: {}, error: { message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 } }
      }
      session = fakeSession(email)
      emit('SIGNED_IN')
      return { data: { session }, error: null }
    }),
    signOut: vi.fn(async () => {
      session = null
      emit('SIGNED_OUT')
      return { error: null }
    }),
  }
  return api as typeof api & AuthApi
}
