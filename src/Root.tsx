import { useEffect, useMemo } from 'react'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { useAuth, type AuthApi } from './auth/authContext.ts'
import { LoginScreen } from './auth/LoginScreen.tsx'
import { supabaseHouseholdApi, type HouseholdApi } from './household/api.ts'
import { HouseholdProvider } from './household/HouseholdProvider.tsx'
import { useHousehold } from './household/householdContext.ts'
import { LoadErrorScreen } from './household/LoadErrorScreen.tsx'
import { OnboardingScreen } from './household/OnboardingScreen.tsx'
import { supabase } from './lib/supabase.ts'
import { useTheme } from './theme/themeContext.ts'

interface RootProps {
  auth?: AuthApi
  householdApi?: HouseholdApi
}

/** Chooses what to show: setup problem, login, household setup, or the app. */
export function Root({ auth = supabase?.auth, householdApi }: RootProps) {
  const api = useMemo(() => householdApi ?? (supabase ? supabaseHouseholdApi(supabase) : null), [householdApi])
  if (!auth || !api) return <NotConfigured />
  return (
    <AuthProvider auth={auth}>
      <AuthGate api={api} />
    </AuthProvider>
  )
}

function AuthGate({ api }: { api: HouseholdApi }) {
  const { ready, session } = useAuth()
  if (!ready) return null // The saved session is read from local storage almost instantly.
  if (!session) return <LoginScreen />
  return (
    // Keyed by user, so logging in as someone else starts from a clean state.
    <HouseholdProvider key={session.user.id} api={api} userId={session.user.id}>
      <HouseholdGate />
    </HouseholdProvider>
  )
}

function HouseholdGate() {
  const { status, snapshot } = useHousehold()
  const { setPref } = useTheme()

  // The theme choice follows the person across devices.
  const themePref = snapshot?.me.theme_pref
  useEffect(() => {
    if (themePref) setPref(themePref)
  }, [themePref, setPref])

  if (status === 'loading') return null
  if (status === 'error') return <LoadErrorScreen />
  if (!snapshot?.household) return <OnboardingScreen />
  return <App />
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
