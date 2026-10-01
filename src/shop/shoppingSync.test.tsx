import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { ClockContext } from '../lib/clock.ts'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { useShopping, type ShoppingState } from './shoppingContext.ts'
import { ShoppingProvider } from './ShoppingProvider.tsx'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0
const OKRA = 'hh-1:okra'
const RICE = 'hh-1:rice'
const NOW = new Date(2026, 9, 5, 18)

function renderShopping({ household = fakeHouseholdApi({ withHousehold: true }), sync = createSync(household.execute, `prabas-shop-test-${++dbCount}`) } = {} as { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync }) {
  const current: { state: ShoppingState | null } = { state: null }
  function Probe() {
    const state = useShopping()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ClockContext.Provider value={() => NOW}>
      <ToastProvider>
        <SyncProvider sync={sync} userId="user-1">
          <ShoppingProvider api={household.shoppingApi} householdId="hh-1" userId="user-1">
            <Probe />
          </ShoppingProvider>
        </SyncProvider>
      </ToastProvider>
    </ClockContext.Provider>,
  )
  const s = () => current.state!
  const ready = () => waitFor(() => expect(s().status).toBe('ready'))
  return { ...result, household, sync, s, ready }
}

describe('the shopping list on this phone', () => {
  test('added by hand: saved as its maker; adding it again changes the amount, not a second line', async () => {
    const { s, household, ready } = renderShopping()
    await ready()
    act(() => void s().addWant(OKRA))
    await waitFor(() => expect(household.server.shopping()).toMatchObject([{ item_id: OKRA, kind: 'want', quantity: null, created_by: 'user-1' }]))
    await waitFor(() => expect(s().rows).toHaveLength(1))
    act(() => void s().addWant(OKRA, 500))
    await waitFor(() => expect(household.server.shopping()).toMatchObject([{ item_id: OKRA, quantity: 500 }]))
    expect(household.server.shopping()).toHaveLength(1)
  })

  test('bought, then undone', async () => {
    const { s, household, ready } = renderShopping()
    await ready()
    let id = ''
    act(() => void (id = s().addWant(RICE).id))
    act(() => s().setBought(id, true))
    await waitFor(() => expect(household.server.shopping()[0]).toMatchObject({ done_at: NOW.toISOString(), done_by: 'user-1' }))
    act(() => s().setBought(id, false))
    await waitFor(() => expect(household.server.shopping()[0]).toMatchObject({ done_at: null, done_by: null }))
  })

  test('a skip lasts three days, and can be undone', async () => {
    const { s, household, ready } = renderShopping()
    await ready()
    let id = ''
    act(() => void (id = s().skip(RICE, 'low').id))
    await waitFor(() => expect(household.server.shopping()).toMatchObject([{ kind: 'skip', section: 'low', skip_until: '2026-10-07' }]))
    act(() => s().removeRow(id))
    await waitFor(() => expect(household.server.shopping()).toHaveLength(0))
  })

  test('added offline: survives reopening, sent when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderShopping({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => void first.s().addWant(OKRA, 250))
    await waitFor(() => expect(first.s().rows).toHaveLength(1))
    first.unmount()

    const second = renderShopping({ household, sync: first.sync })
    await second.ready()
    expect(second.s().rows[0]).toMatchObject({ item_id: OKRA, quantity: 250 })
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.shopping()).toMatchObject([{ item_id: OKRA, quantity: 250 }]))
  })

  test("the other phone's additions and ticks show up live", async () => {
    const { s, household, ready } = renderShopping()
    await ready()
    let line = { id: '' }
    act(() => void (line = household.server.otherPhoneShops({ item_id: OKRA })))
    await waitFor(() => expect(s().rows).toMatchObject([{ item_id: OKRA, created_by: 'user-2' }]))
    act(() => void household.server.otherPhoneShops({ id: line.id, item_id: OKRA, done_at: NOW.toISOString(), done_by: 'user-2' }))
    await waitFor(() => expect(s().rows[0].done_by).toBe('user-2'))
  })
})
