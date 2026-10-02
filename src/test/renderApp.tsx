import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { Root } from '../Root.tsx'
import { ThemeProvider } from '../theme/ThemeProvider.tsx'
import { ClockContext } from '../lib/clock.ts'
import { fakeAuth, fakeSession } from './fakeAuth.ts'
import { fakeDrive } from './fakeDrive.ts'
import { fakeHouseholdApi } from './fakeHousehold.ts'
import type { DriveDeps } from '../backup/drive/driveBackup.ts'
import type { PushDeps } from '../reminders/push.ts'
import { fakePush } from './fakePush.ts'
import { OcrContext, type Ocr } from '../bills/ocr.ts'

interface Options {
  path?: string
  auth?: ReturnType<typeof fakeAuth>
  household?: ReturnType<typeof fakeHouseholdApi>
  /** Reuse a device's local database, as when reopening the app. */
  sync?: Sync
  /** Google Drive; null for a build without a Google client id. */
  drive?: DriveDeps | null
  /** This phone's push reminders. */
  push?: PushDeps | null
  /** A fixed time for screens that work from "today" (the real clock if not given). */
  now?: Date
  /** A clock the test moves along (batches over several days). Wins over `now`. */
  clock?: () => Date
  /** Reading bill photos (none unless given). */
  ocr?: Ocr | null
}

let dbCount = 0

/** Renders the whole app as in main.tsx, signed in and in a household unless told otherwise. */
export function renderApp({
  path = '/',
  auth = fakeAuth({ session: fakeSession() }),
  household = fakeHouseholdApi({ withHousehold: true }),
  sync = createSync(household.execute, `prabas-test-${++dbCount}`),
  drive = fakeDrive().deps,
  push = fakePush().deps,
  now,
  clock: movable,
  ocr = null,
}: Options = {}) {
  const clock = movable ?? (now ? () => new Date(now) : () => new Date())
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <ClockContext.Provider value={clock}>
      <ThemeProvider>
        <ToastProvider>
          <OcrContext.Provider value={ocr}>
          <Root auth={auth} householdApi={household} stockApi={household.stockApi} dishApi={household.dishApi} mealApi={household.mealApi} calendarApi={household.calendarApi} batchApi={household.batchApi} shoppingApi={household.shoppingApi} reminderApi={household.reminderApi} billApi={household.billApi} backupApi={household.backupApi} sync={sync} drive={drive} push={push} />
          </OcrContext.Provider>
        </ToastProvider>
      </ThemeProvider>
      </ClockContext.Provider>
    </MemoryRouter>,
  )
  return { ...result, auth, household, sync }
}
