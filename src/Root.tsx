import { useCallback, useEffect, useMemo } from 'react'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { useAuth, type AuthApi } from './auth/authContext.ts'
import { LoginScreen } from './auth/LoginScreen.tsx'
import { supabaseBackupApi, type BackupApi } from './backup/api.ts'
import { BackupApiContext } from './backup/backupContext.ts'
import { GD, type DriveDeps } from './backup/drive/driveBackup.ts'
import { DriveDepsContext } from './backup/drive/driveContext.ts'
import { driveFiles } from './backup/drive/driveFiles.ts'
import { googleClientId, googleTokenSource } from './backup/drive/google.ts'
import { supabaseHouseholdApi, type HouseholdApi } from './household/api.ts'
import { HouseholdProvider } from './household/HouseholdProvider.tsx'
import { useHousehold } from './household/householdContext.ts'
import { LoadErrorScreen } from './household/LoadErrorScreen.tsx'
import { OnboardingScreen } from './household/OnboardingScreen.tsx'
import { supabase } from './lib/supabase.ts'
import { supabaseExecutor } from './offline/executor.ts'
import { createSync, type Sync } from './offline/setup.ts'
import { SyncProvider } from './offline/SyncProvider.tsx'
import { supabaseCalendarApi, type CalendarApi } from './calendar/api.ts'
import { CalendarProvider } from './calendar/CalendarProvider.tsx'
import { supabaseDishApi, type DishApi } from './dishes/api.ts'
import { DishProvider } from './dishes/DishProvider.tsx'
import { supabaseMealApi, type MealApi } from './plan/api.ts'
import { MealProvider } from './plan/MealProvider.tsx'
import { supabaseBatchApi, type BatchApi } from './prepared/api.ts'
import { BatchProvider } from './prepared/BatchProvider.tsx'
import { supabaseShoppingApi, type ShoppingApi } from './shop/api.ts'
import { ShoppingProvider } from './shop/ShoppingProvider.tsx'
import { supabaseReminderApi, type ReminderApi } from './reminders/api.ts'
import { ReminderProvider } from './reminders/ReminderProvider.tsx'
import { browserPush, PushDepsContext, type PushDeps } from './reminders/push.ts'
import { supabaseStockApi, type StockApi } from './stock/api.ts'
import { StockProvider } from './stock/StockProvider.tsx'
import { useTheme } from './theme/themeContext.ts'

// One local database and outbox for the app's lifetime.
const defaultSync = supabase ? createSync(supabaseExecutor(supabase)) : null
// Google Drive, if this build has a Google client id.
// Push reminders, if this build has a VAPID public key (see .env.example).
const defaultPush: PushDeps | null = supabase ? browserPush(supabase, import.meta.env.VITE_VAPID_PUBLIC_KEY || null) : null
const defaultDrive: DriveDeps | null = googleClientId
  ? { tokens: googleTokenSource(googleClientId), files: driveFiles() }
  : null

interface RootProps {
  auth?: AuthApi
  householdApi?: HouseholdApi
  stockApi?: StockApi
  dishApi?: DishApi
  mealApi?: MealApi
  calendarApi?: CalendarApi
  batchApi?: BatchApi
  shoppingApi?: ShoppingApi
  reminderApi?: ReminderApi
  backupApi?: BackupApi
  sync?: Sync
  drive?: DriveDeps | null
  push?: PushDeps | null
}

/** Chooses what to show: setup problem, login, household setup, or the app. */
export function Root({
  auth = supabase?.auth,
  householdApi,
  stockApi,
  dishApi,
  mealApi,
  calendarApi,
  batchApi,
  shoppingApi,
  reminderApi,
  backupApi,
  sync = defaultSync ?? undefined,
  drive = defaultDrive,
  push = defaultPush,
}: RootProps) {
  const api = useMemo(() => householdApi ?? (supabase ? supabaseHouseholdApi(supabase) : null), [householdApi])
  const stock = useMemo(() => stockApi ?? (supabase ? supabaseStockApi(supabase) : null), [stockApi])
  const dishesApi = useMemo(() => dishApi ?? (supabase ? supabaseDishApi(supabase) : null), [dishApi])
  const mealsApi = useMemo(() => mealApi ?? (supabase ? supabaseMealApi(supabase) : null), [mealApi])
  const calApi = useMemo(() => calendarApi ?? (supabase ? supabaseCalendarApi(supabase) : null), [calendarApi])
  const batchesApi = useMemo(() => batchApi ?? (supabase ? supabaseBatchApi(supabase) : null), [batchApi])
  const shopApi = useMemo(() => shoppingApi ?? (supabase ? supabaseShoppingApi(supabase) : null), [shoppingApi])
  const remindApi = useMemo(() => reminderApi ?? (supabase ? supabaseReminderApi(supabase) : null), [reminderApi])
  const backup = useMemo(() => backupApi ?? (supabase ? supabaseBackupApi(supabase) : null), [backupApi])
  // Nothing from one person's session stays on the device after they log out.
  const onSignedOut = useCallback(async () => {
    Object.values(GD).forEach((k) => localStorage.removeItem(k))
    drive?.tokens.forget()
    await sync?.db.clearAll()
  }, [sync, drive])
  if (!auth || !api || !stock || !dishesApi || !mealsApi || !calApi || !batchesApi || !shopApi || !remindApi || !backup || !sync) return <NotConfigured />
  return (
    <AuthProvider auth={auth} onSignedOut={onSignedOut}>
      <BackupApiContext.Provider value={backup}>
        <DriveDepsContext.Provider value={drive}>
          <PushDepsContext.Provider value={push}>
          <AuthGate api={api} apis={{ stock, dishes: dishesApi, meals: mealsApi, calendar: calApi, batches: batchesApi, shopping: shopApi, reminders: remindApi }} sync={sync} />
          </PushDepsContext.Provider>
        </DriveDepsContext.Provider>
      </BackupApiContext.Provider>
    </AuthProvider>
  )
}

/** The stock and dish backends, passed down to the household's providers. */
interface DataApis {
  stock: StockApi
  dishes: DishApi
  meals: MealApi
  calendar: CalendarApi
  batches: BatchApi
  shopping: ShoppingApi
  reminders: ReminderApi
}

function AuthGate({ api, apis, sync }: { api: HouseholdApi; apis: DataApis; sync: Sync }) {
  const { ready, session } = useAuth()
  if (!ready) return null // The saved session is read from local storage almost instantly.
  if (!session) return <LoginScreen />
  const userId = session.user.id
  return (
    // Keyed by user, so logging in as someone else starts from a clean state.
    <SyncProvider key={userId} sync={sync} userId={userId}>
      <HouseholdProvider api={api} userId={userId}>
        <HouseholdGate apis={apis} />
      </HouseholdProvider>
    </SyncProvider>
  )
}

function HouseholdGate({ apis }: { apis: DataApis }) {
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
  return (
    <StockProvider api={apis.stock} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
      <DishProvider api={apis.dishes} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
        <MealProvider api={apis.meals} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
          <CalendarProvider api={apis.calendar} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
            <BatchProvider api={apis.batches} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
              <ShoppingProvider api={apis.shopping} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
                <ReminderProvider api={apis.reminders} householdId={snapshot.household.id} userId={snapshot.me.user_id}>
                  <App />
                </ReminderProvider>
              </ShoppingProvider>
            </BatchProvider>
          </CalendarProvider>
        </MealProvider>
      </DishProvider>
    </StockProvider>
  )
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
