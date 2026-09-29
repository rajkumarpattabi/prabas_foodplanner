import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, describeAuthError, type AuthApi } from './authContext.ts'

export function AuthProvider({ auth, children }: { auth: AuthApi; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let active = true
    void auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [auth])

  const sendCode = useCallback(
    async (email: string) => {
      try {
        const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
        return error ? describeAuthError(error) : null
      } catch (e) {
        return describeAuthError(e as Error)
      }
    },
    [auth],
  )

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      try {
        const { error } = await auth.verifyOtp({ email, token: code, type: 'email' })
        return error ? describeAuthError(error) : null
      } catch (e) {
        return describeAuthError(e as Error)
      }
    },
    [auth],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
  }, [auth])

  const value = useMemo(
    () => ({ ready, session, sendCode, verifyCode, signOut }),
    [ready, session, sendCode, verifyCode, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
