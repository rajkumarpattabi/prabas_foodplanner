import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { useAuth, type AuthApi } from './auth/authContext.ts'
import { LoginScreen } from './auth/LoginScreen.tsx'
import { supabase } from './lib/supabase.ts'

/** Chooses what to show: setup problem, login, or the app. */
export function Root({ auth = supabase?.auth }: { auth?: AuthApi }) {
  if (!auth) return <NotConfigured />
  return (
    <AuthProvider auth={auth}>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { ready, session } = useAuth()
  if (!ready) return null // The saved session is read from local storage almost instantly.
  return session ? <App /> : <LoginScreen />
}

function NotConfigured() {
  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">PRABAS isn't set up yet</h1>
      <p className="mt-2 text-ink-muted">
        This build has no Supabase settings. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local, or to the
        GitHub repository secrets for the deployed app.
      </p>
    </div>
  )
}
