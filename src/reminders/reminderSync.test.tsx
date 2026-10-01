import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import { useReminders, type ReminderState } from './reminderContext.ts'
import { ReminderProvider } from './ReminderProvider.tsx'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const NOW = at(5, 18) // Monday 5 Oct 2026
const LONG = { timeout: 5000 }

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}
afterEach(() => setOnline(true))

/** Ragi koozh planned: soak tonight at 9 pm. */
function withRagi() {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addPrepared()
  h.server.addBatch({
    id: 'b-ragi',
    dish_id: 'hh-1:dish:ragi_koozh',
    name_ta: 'கேழ்வரகுக் கூழ்',
    name_en: 'Ragi koozh',
    stages: [
      { key: 'soak', hours: 9, action: true, takes_ingredients: true },
      { key: 'cook', hours: 1, action: true },
      { key: 'ferment', hours: 24, action: false, adjustable: true },
    ],
    planned_start: at(5, 21).toISOString(),
    yield: 10,
    unit: 'glasses',
    keeps_days: 3,
  })
  return h
}
const ids = (h: ReturnType<typeof fakeHouseholdApi>) => h.server.reminders().map((r) => r.id).sort()

describe('the phones keep the reminders up to date', () => {
  test('a batch to soak tonight: its reminders are written, as this person, in their script', async () => {
    const h = withRagi()
    renderApp({ path: '/plan', household: h, now: NOW })
    await waitFor(() => expect(ids(h)).toEqual(['hh-1:low:2026-10-05', 'hh-1:ready:b-ragi', 'hh-1:stage:b-ragi:0', 'hh-1:tonight:b-ragi:0']), LONG)
    expect(h.server.reminders().find((r) => r.id === 'hh-1:tonight:b-ragi:0')).toMatchObject({
      type: 'prep',
      title: 'Tonight: soak கேழ்வரகுக் கூழ் at 9 pm',
      due_date: '2026-10-05',
      at_evening: true,
      created_by: 'user-1',
    })
    // Running low: rice is out.
    expect(h.server.reminders().find((r) => r.type === 'low')?.body).toBe('அரிசி')
  })

  test('nothing more is written once they match', async () => {
    const h = withRagi()
    renderApp({ path: '/plan', household: h, now: NOW })
    await waitFor(() => expect(ids(h)).toHaveLength(4), LONG)
    const writes = () => h.execute.mock.calls.filter(([op]) => op.table === 'reminders').length
    // Let the first round finish going out, then nothing more should follow.
    await new Promise((r) => setTimeout(r, 2500))
    const before = writes()
    expect(before).toBe(8) // 4 made, 4 set
    await new Promise((r) => setTimeout(r, 2500))
    expect(writes()).toBe(before)
  }, 15_000)

  test('the batch is cancelled: its reminders go', async () => {
    const h = withRagi()
    renderApp({ path: '/plan', household: h, now: NOW })
    await waitFor(() => expect(ids(h)).toHaveLength(4), LONG)
    const card = await screen.findByRole('article', { name: 'கேழ்வரகுக் கூழ்' })
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(ids(h)).toEqual(['hh-1:low:2026-10-05']), LONG)
  })
})

let dbCount = 0
function renderSettings({ household = fakeHouseholdApi({ withHousehold: true }), sync = createSync(household.execute, `prabas-rem-test-${++dbCount}`) } = {} as { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync }) {
  const current: { state: ReminderState | null } = { state: null }
  function Probe() {
    const state = useReminders()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <ReminderProvider api={household.reminderApi} householdId="hh-1" userId="user-1">
          <Probe />
        </ReminderProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const r = () => current.state!
  return { ...result, household, sync, r, ready: () => waitFor(() => expect(r().status).toBe('ready')) }
}

describe('reminder settings', () => {
  test('defaults until saved; saving keeps the defaults for the rest', async () => {
    const { r, household, ready } = renderSettings()
    await ready()
    expect(r().settings).toMatchObject({ saved: false, evening_time: '20:30', quiet_from: '22:00', quiet_to: '06:30', types: ['prep', 'stage', 'nonveg', 'low', 'expiry'] })
    act(() => r().saveSettings({ evening_time: '21:00', types: ['stage'] }))
    expect(r().settings).toMatchObject({ saved: true, evening_time: '21:00', types: ['stage'] })
    await waitFor(() => expect(household.server.reminderSettings()).toMatchObject({ user_id: 'user-1', household_id: 'hh-1', evening_time: '21:00', types: ['stage'], quiet_from: '22:00' }))
  })

  test('changed offline: kept on reopening, saved when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderSettings({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => first.r().saveSettings({ quiet_from: '23:00' }))
    await new Promise((r) => setTimeout(r, 50))
    first.unmount()

    const second = renderSettings({ household, sync: first.sync })
    await second.ready()
    expect(second.r().settings.quiet_from).toBe('23:00')
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.reminderSettings()?.quiet_from).toBe('23:00'))
  })
})
