import { useCallback, useEffect, useMemo } from 'react'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { useAuth, type AuthApi } from './auth/authContext.ts'
import { LoginScreen } from './auth/LoginScreen.tsx'
import { supabaseBackupApi, type BackupApi } from './backup/api.ts'
import { BackupApiContext } from './backup/backupContext.ts'
import { supabaseHouseholdApi, type HouseholdApi } from './household/api.ts'
import { HouseholdProvider } from './household/HouseholdProvider.tsx'
import { useHousehold } from './household/householdContext.ts'
import { LoadErrorScreen } from './household/LoadErrorScreen.tsx'
import { OnboardingScreen } from './household/OnboardingScreen.tsx'
import { supabase } from './lib/supabase.ts'
import { supabaseExecutor } from './offline/executor.ts'
import { createSync, type Sync } from './offline/setup.ts'
import { SyncProvider } from './offline/SyncProvider.tsx'
import { useTheme } from './theme/themeContext.ts'

// One local database and outbox for the app's lifetime.
const defaultSync = supabase ? createSync(supabaseExecutor(supabase)) : null

interface RootProps {
  auth?: AuthApi
  householdApi?: HouseholdApi
  backupApi?: BackupApi
  sync?: Sync
}

/** Chooses what to show: setup problem, login, household setup, or the app. */
export function Root({ auth = supabase?.auth, householdApi, backupApi, sync = defaultSync ?? undefined }: RootProps) {
  const api = useMemo(() => householdApi ?? (supabase ? supabaseHouseholdApi(supabase) : null), [householdApi])
  const backup = useMemo(() => backupApi ?? (supabase ? supabaseBackupApi(supabase) : null), [backupApi])
  // Nothing from one person's session stays on the device after they log out.
  const onSignedOut = useCallback(() => sync?.db.clearAll() ?? Promise.resolve(), [sync])
  if (!auth || !api || !backup || !sync) return <NotConfigured />
  return (
    <AuthProvider auth={auth} onSignedOut={onSignedOut}>
      <BackupApiContext.Provider value={backup}>
        <AuthGate api={api} sync={sync} />
      </BackupApiContext.Provider>
    </AuthProvider>
  )
}

function AuthGate({ api, sync }: { api: HouseholdApi; sync: Sync }) {
  const { ready, session } = useAuth()
  if (!ready) return null // The saved session is read from local storage almost instantly.
  if (!session) return <LoginScreen />
  const userId = session.user.id
  return (
    // Keyed by user, so logging in as someone else starts from a clean state.
    <SyncProvider key={userId} sync={sync} userId={userId}>
      <HouseholdProvider api={api} userId={userId}>
        <HouseholdGate />
      </HouseholdProvider>
    </SyncProvider>
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
