import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { HouseholdSnapshot } from '../household/api.ts'
import { applyPending } from '../household/pending.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import type { OutboxOp } from './db.ts'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

describe('offline-first app', () => {
  test('edits made offline show at once, wait in the queue, and sync when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/settings', household })
    const name = (await screen.findByLabelText('Your name')) as HTMLInputElement

    household.setOffline(true)
    setOnline(false)
    fireEvent.change(name, { target: { value: 'Rajkumar' } })
    fireEvent.blur(name)

    expect(name.value).toBe('Rajkumar')
    expect(await screen.findByText('Offline · 1 change waiting')).toBeTruthy()
    expect(household.server.profile('user-1')?.display_name).toBe('raj')

    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.profile('user-1')?.display_name).toBe('Rajkumar'))
    await waitFor(() => expect(screen.queryByText(/waiting|Saving/)).toBeNull())
    expect(name.value).toBe('Rajkumar')
  })

  test('reopening offline shows the last saved household, not an error', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderApp({ path: '/settings', household })
    expect(await screen.findByText('K7M-4QP')).toBeTruthy()
    first.unmount()

    household.setOffline(true)
    renderApp({ path: '/settings', household, sync: first.sync })
    expect(await screen.findByText('K7M-4QP')).toBeTruthy()
    expect(screen.queryByText("Couldn't load your household")).toBeNull()
  })

  test('the very first open offline explains itself and offers a retry', async () => {
    const household = fakeHouseholdApi({ withHousehold: true, offline: true })
    renderApp({ household })
    expect(await screen.findByText("Couldn't load your household")).toBeTruthy()

    household.setOffline(false)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Plan' })).toBeTruthy()
  })

  test('logging out clears the data saved on this device', async () => {
    const { sync } = renderApp({ path: '/settings' })
    expect(await screen.findByText('K7M-4QP')).toBeTruthy()
    await waitFor(async () => expect(await sync.db.cache.count()).toBe(1))

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    await waitFor(async () => expect(await sync.db.cache.count()).toBe(0))
  })
})

describe('applyPending', () => {
  const snapshot: HouseholdSnapshot = {
    me: {
      user_id: 'u1',
      display_name: 'raj',
      script_pref: 'ta_first',
      theme_pref: 'auto',
      created_by: 'u1',
      created_at: '',
      updated_by: 'u1',
      updated_at: '',
    },
    household: {
      id: 'hh-1',
      name: 'Old',
      join_code: 'K7M4QP',
      backup_owner_id: 'u1',
      drive_backup_at: null,
      created_by: 'u1',
      created_at: '',
      updated_by: 'u1',
      updated_at: '',
    },
    members: [],
  }
  const op = (table: string, match: Record<string, string>, patch: Record<string, unknown>): OutboxOp => ({
    kind: 'update',
    table,
    match,
    patch,
    id: 'x',
    userId: 'u1',
    createdAt: '',
    attempts: 0,
  })

  test('lays unsent changes over server data, in order', () => {
    const s = applyPending(snapshot, [
      op('households', { id: 'hh-1' }, { name: 'First' }),
      op('households', { id: 'hh-1' }, { name: 'Second' }),
      op('profiles', { user_id: 'u1' }, { script_pref: 'en_first' }),
    ])
    expect(s.household?.name).toBe('Second')
    expect(s.me.script_pref).toBe('en_first')
  })

  test('ignores changes for other rows', () => {
    const s = applyPending(snapshot, [op('households', { id: 'other' }, { name: 'Nope' })])
    expect(s).toEqual(snapshot)
  })
})
