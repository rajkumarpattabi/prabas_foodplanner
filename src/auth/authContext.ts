import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/** The parts of Supabase auth the app uses. Tests pass a fake with the same shape. */
export type AuthApi = Pick<
  SupabaseClient['auth'],
  'getSession' | 'onAuthStateChange' | 'signInWithOtp' | 'verifyOtp' | 'signOut'
>

export interface AuthState {
  /** False until the saved session has been read. */
  ready: boolean
  session: Session | null
  /** Emails a 6-digit code. Resolves to a readable error message, or null on success. */
  sendCode: (email: string) => Promise<string | null>
  /** Checks the code and signs in. Resolves to a readable error message, or null on success. */
  verifyCode: (email: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** Turns Supabase auth errors into short, plain messages for the login screens. */
export function describeAuthError(error: AuthError | Error): string {
  const code = 'code' in error ? error.code : undefined
  const status = 'status' in error ? error.status : undefined
  if (code === 'over_email_send_rate_limit' || status === 429) {
    return 'Too many codes sent. Wait a while, then try again.'
  }
  if (code === 'otp_expired' || code === 'invalid_credentials' || status === 403) {
    return "That code didn't work. Check it, or send a new one."
  }
  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return 'Check the email address.'
  }
  if (!navigator.onLine || error.message.toLowerCase().includes('fetch')) {
    return "You're offline. Try again when you're connected."
  }
  return 'Something went wrong. Try again.'
}
