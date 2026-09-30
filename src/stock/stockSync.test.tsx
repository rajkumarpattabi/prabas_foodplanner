import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { computeStock } from './computeStock.ts'
import { StockProvider } from './StockProvider.tsx'
import { useStock, type StockState } from './stockContext.ts'

const OKRA = 'hh-1:okra'
const COCONUT = 'hh-1:coconut'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0

/** The stock layer on one phone (user-1), against the fake server. */
function renderStock({
  household = fakeHouseholdApi({ withHousehold: true }),
  sync = createSync(household.execute, `prabas-stock-test-${++dbCount}`),
}: { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync } = {}) {
  const current: { state: StockState | null } = { state: null }
  function Probe() {
    const state = useStock()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <StockProvider api={household.stockApi} householdId="hh-1" userId="user-1">
          <Probe />
        </StockProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const stock = () => current.state!
  const total = (itemId: string) => {
    const item = stock().items.find((i) => i.id === itemId)!
    return computeStock(item, stock().eventsByItem.get(itemId) ?? []).total
  }
  const ready = () => waitFor(() => expect(stock().status).toBe('ready'))
  return { ...result, household, sync, stock, total, ready }
}

describe('stock on this phone', () => {
  test('loads the household items from the server', async () => {
    const { stock, ready } = renderStock()
    await ready()
    expect(stock().items.map((i) => i.name_en).sort()).toEqual(['Coconut', 'Egg', 'Ladies finger', 'Rice'])
  })

  test('a change shows at once and is saved with who made it', async () => {
    const { stock, total, household, ready } = renderStock()
    await ready()
    act(() => void stock().record([{ item_id: OKRA, kind: 'delta', quantity: 500, reason: 'bought' }]))

    await waitFor(() => expect(total(OKRA)).toBe(500))
    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    expect(household.server.events()[0]).toMatchObject({ item_id: OKRA, quantity: 500, created_by: 'user-1' })
  })

  test('a new item is saved, and can be stocked straight away', async () => {
    const { stock, total, household, ready } = renderStock()
    await ready()
    act(() => {
      const item = stock().addItem({ name_ta: 'கத்தரிக்காய்', name_en: 'Brinjal', category: 'vegetable', unit: 'g' })
      stock().record([{ item_id: item.id, kind: 'delta', quantity: 250, reason: 'bought' }])
    })

    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    const saved = household.server.items().find((i) => i.name_en === 'Brinjal')!
    expect(saved).toMatchObject({ created_by: 'user-1', step: 250, display_unit: 'g' })
    expect(total(saved.id)).toBe(250)
  })

  test('changes made offline wait, survive reopening the app, and sync when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderStock({ household })
    await first.ready()

    household.setOffline(true)
    setOnline(false)
    act(() => void first.stock().record([{ item_id: OKRA, kind: 'delta', quantity: 500, reason: 'bought' }]))
    await waitFor(() => expect(first.total(OKRA)).toBe(500))
    first.unmount()

    // Reopened, still offline: opens from this device's copy.
    const second = renderStock({ household, sync: first.sync })
    await second.ready()
    expect(second.total(OKRA)).toBe(500)
    expect(household.server.events()).toHaveLength(0)

    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    expect(second.total(OKRA)).toBe(500)
  })

  test('the very first open offline reports an error', async () => {
    const { stock } = renderStock({ household: fakeHouseholdApi({ withHousehold: true, offline: true }) })
    await waitFor(() => expect(stock().status).toBe('error'))
  })

  test('a change the server refuses is undone', async () => {
    const { stock, household, sync, ready } = renderStock()
    await ready()
    act(() => void stock().record([{ item_id: 'hh-1:no-such-item', kind: 'delta', quantity: 1 }]))

    await waitFor(async () => expect(await sync.db.stock_events.count()).toBe(0))
    expect(household.server.events()).toHaveLength(0)
  })

  test('logging out clears items and stock from the device', async () => {
    const { sync, ready } = renderStock()
    await ready()
    await sync.db.clearAll()
    expect(await sync.db.items.count()).toBe(0)
  })
})

describe('two phones', () => {
  test('both changing the same item at the same moment: both count', async () => {
    const { stock, total, household, ready } = renderStock()
    await ready()
    household.server.otherPhoneRecords({
      id: 'theirs',
      item_id: OKRA,
      kind: 'delta',
      quantity: 1000,
      reason: 'bought',
      batch_id: null,
      expires_on: null,
      form: 'whole',
      note: null,
      occurred_at: new Date().toISOString(),
    })
    act(() => void stock().record([{ item_id: OKRA, kind: 'delta', quantity: -200, reason: 'cooked' }]))

    await waitFor(() => expect(total(OKRA)).toBe(800))
    await waitFor(() => expect(household.server.events()).toHaveLength(2))
  })

  test("a change missed while asleep shows up on the next reload", async () => {
    const { stock, total, household, ready } = renderStock()
    await ready()
    household.server.otherPhoneRecords(
      {
        id: 'missed',
        item_id: COCONUT,
        kind: 'delta',
        quantity: 2,
        reason: 'bought',
        batch_id: null,
        expires_on: null,
        form: 'whole',
        note: null,
        occurred_at: new Date().toISOString(),
      },
      { live: false },
    )
    expect(total(COCONUT)).toBe(0)
    await act(() => stock().reload())
    expect(total(COCONUT)).toBe(2)
  })

  test("a reload keeps this phone's unsent changes, and live edits keep a queued rename", async () => {
    const { stock, total, household, ready } = renderStock()
    await ready()
    // The server can be read but this phone's writes aren't getting through yet.
    const execute = household.execute.getMockImplementation()!
    household.execute.mockImplementation(async () => ({ status: 'retry' }))

    act(() => {
      stock().record([{ item_id: OKRA, kind: 'delta', quantity: 500, reason: 'bought' }])
      stock().updateItem(OKRA, { name_en: 'Okra' })
    })
    await waitFor(() => expect(stock().items.find((i) => i.id === OKRA)?.name_en).toBe('Okra'))

    household.server.otherPhoneEditsItem(OKRA, { step: 500 })
    await waitFor(() => expect(stock().items.find((i) => i.id === OKRA)?.step).toBe(500))
    await act(() => stock().reload())
    expect(stock().items.find((i) => i.id === OKRA)).toMatchObject({ name_en: 'Okra', step: 500 })
    expect(total(OKRA)).toBe(500)

    household.execute.mockImplementation(execute)
    setOnline(true)
    await waitFor(() => expect(household.server.items().find((i) => i.id === OKRA)?.name_en).toBe('Okra'))
    expect(household.server.events()).toHaveLength(1)
  })
})
