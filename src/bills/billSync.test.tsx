import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { useBills, type BillState } from './billContext.ts'
import { BillProvider } from './BillProvider.tsx'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}
afterEach(() => setOnline(true))

let dbCount = 0
const OKRA = 'hh-1:okra'
const COCONUT = 'hh-1:coconut'

function renderBills({ household = fakeHouseholdApi({ withHousehold: true }), sync = createSync(household.execute, `prabas-bill-test-${++dbCount}`) } = {} as { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync }) {
  const current: { state: BillState | null } = { state: null }
  function Probe() {
    const state = useBills()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <BillProvider api={household.billApi} householdId="hh-1" userId="user-1">
          <Probe />
        </BillProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const b = () => current.state!
  return { ...result, household, sync, b, ready: () => waitFor(() => expect(b().status).toBe('ready')) }
}

describe('bills on this phone', () => {
  test('a bill is saved as its maker, and can be removed', async () => {
    const { b, household, ready } = renderBills()
    await ready()
    let id = ''
    act(() => void (id = b().addBill({ vendor: 'Murugan Vegetables', bill_date: '2026-10-02', total: 235, lines: 6 }).id))
    await waitFor(() => expect(household.server.bills()).toMatchObject([{ id, vendor: 'Murugan Vegetables', created_by: 'user-1' }]))
    act(() => b().removeBill(id))
    await waitFor(() => expect(household.server.bills()).toHaveLength(0))
  })

  test('names: new ones added, a changed one updated; undo puts both back', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addBillAlias({ vendor: '', raw: 'tenkai', item_id: OKRA })
    const { b, ready } = renderBills({ household })
    await ready()
    await waitFor(() => expect(b().aliases).toHaveLength(1))
    let undo = () => {}
    act(() => {
      undo = b().saveAliases([
        { vendor: '', raw: 'tenkai', item_id: COCONUT },
        { vendor: 'murukan', raw: 'peans', item_id: OKRA },
      ])
    })
    await waitFor(() =>
      expect(household.server.billAliases().map((a) => [a.vendor, a.raw, a.item_id]).sort()).toEqual([
        ['', 'tenkai', COCONUT],
        ['murukan', 'peans', OKRA],
      ]),
    )
    // Saving the same again changes nothing.
    const writes = household.execute.mock.calls.length
    act(() => void b().saveAliases([{ vendor: '', raw: 'tenkai', item_id: COCONUT }]))
    await new Promise((r) => setTimeout(r, 300))
    expect(household.execute.mock.calls.length).toBe(writes)

    act(() => undo())
    await waitFor(() => expect(household.server.billAliases().map((a) => [a.vendor, a.raw, a.item_id])).toEqual([['', 'tenkai', OKRA]]))
  })

  test('taught offline: kept on reopening, sent when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderBills({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => void first.b().saveAliases([{ vendor: '', raw: 'tenkai', item_id: COCONUT }]))
    await waitFor(() => expect(first.b().aliases).toHaveLength(1))
    first.unmount()

    const second = renderBills({ household, sync: first.sync })
    await second.ready()
    expect(second.b().aliases).toMatchObject([{ raw: 'tenkai', item_id: COCONUT }])
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.billAliases()).toMatchObject([{ raw: 'tenkai', item_id: COCONUT, created_by: 'user-1' }]))
  })

  test("the other phone's names show up live", async () => {
    const { b, household, ready } = renderBills()
    await ready()
    act(() => void household.server.addBillAlias({ vendor: '', raw: 'tenkai', item_id: COCONUT }))
    await waitFor(() => expect(b().aliases).toMatchObject([{ raw: 'tenkai', item_id: COCONUT }]))
  })
})
