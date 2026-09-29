import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { Root } from '../Root.tsx'
import { ThemeProvider } from '../theme/ThemeProvider.tsx'
import { fakeAuth, fakeSession } from './fakeAuth.ts'
import { fakeHouseholdApi } from './fakeHousehold.ts'

interface Options {
  path?: string
  auth?: ReturnType<typeof fakeAuth>
  household?: ReturnType<typeof fakeHouseholdApi>
  /** Reuse a device's local database, as when reopening the app. */
  sync?: Sync
}

let dbCount = 0

/** Renders the whole app as in main.tsx, signed in and in a household unless told otherwise. */
export function renderApp({
  path = '/',
  auth = fakeAuth({ session: fakeSession() }),
  household = fakeHouseholdApi({ withHousehold: true }),
  sync = createSync(household.execute, `prabas-test-${++dbCount}`),
}: Options = {}) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <Root auth={auth} householdApi={household} backupApi={household.backupApi} sync={sync} />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...result, auth, household, sync }
}
