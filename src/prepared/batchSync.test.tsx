import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { useBatches, type BatchesState, type NewBatch } from './batchContext.ts'
import { BatchProvider } from './BatchProvider.tsx'
import { batchState } from './batchState.ts'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0

const RAGI: NewBatch = {
  dish_id: 'hh-1:ragi_koozh',
  name_ta: 'கேழ்வரகுக் கூழ்',
  name_en: 'Ragi koozh',
  stages: [
    { key: 'soak', hours: 9, action: true, takes_ingredients: true },
    { key: 'cook', hours: 1, action: true },
    { key: 'ferment', hours: 24, action: false, adjustable: true },
  ],
  planned_start: new Date(2026, 9, 6, 21),
  ready_by: new Date(2026, 9, 8, 7),
  yield: 10,
  unit: 'glasses',
  keeps_days: 3,
}

function renderBatches({ household = fakeHouseholdApi({ withHousehold: true }), sync = createSync(household.execute, `prabas-batch-test-${++dbCount}`) } = {} as { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync }) {
  const current: { state: BatchesState | null } = { state: null }
  function Probe() {
    const state = useBatches()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <BatchProvider api={household.batchApi} householdId="hh-1" userId="user-1">
          <Probe />
        </BatchProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const b = () => current.state!
  const ready = () => waitFor(() => expect(b().status).toBe('ready'))
  const left = (id: string) => batchState(b().batches.find((x) => x.id === id)!, b().events, new Date(2026, 9, 8, 9)).remaining
  return { ...result, household, sync, b, ready, left }
}

describe('batches on this phone', () => {
  test('a batch started here is saved, as its starter', async () => {
    const { b, household, ready } = renderBatches()
    await ready()
    let id = ''
    act(() => void (id = b().startBatch(RAGI).id))
    await waitFor(() =>
      expect(household.server.batches().find((x) => x.id === id)).toMatchObject({
        name_en: 'Ragi koozh',
        unit: 'glasses',
        yield: 10,
        created_by: 'user-1',
        planned_start: new Date(2026, 9, 6, 21).toISOString(),
      }),
    )
  })

  test('both phones have a glass at once: both count', async () => {
    const { b, household, ready, left } = renderBatches()
    await ready()
    let id = ''
    act(() => void (id = b().startBatch(RAGI).id))
    act(() => {
      b().addEvent(id, { kind: 'done', stage: 0, at: new Date(2026, 9, 6, 21) })
      b().addEvent(id, { kind: 'done', stage: 1, at: new Date(2026, 9, 7, 6) })
    })
    await waitFor(() => expect(household.server.batchEvents()).toHaveLength(2))
    act(() => {
      b().addEvent(id, { kind: 'used', quantity: 1 })
      household.server.otherPhoneAddsBatchEvent({ batch_id: id, kind: 'used', quantity: 1 })
    })
    await waitFor(() => expect(left(id)).toBe(8))
    await waitFor(() => expect(household.server.batchEvents().filter((e) => e.kind === 'used')).toHaveLength(2))
  })

  test('started and used offline: survives reopening, sent when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderBatches({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    let id = ''
    act(() => void (id = first.b().startBatch(RAGI).id))
    act(() => void first.b().addEvent(id, { kind: 'used', quantity: 3 }))
    await waitFor(() => expect(first.b().events).toHaveLength(1))
    first.unmount()

    const second = renderBatches({ household, sync: first.sync })
    await second.ready()
    expect(second.left(id)).toBe(7)
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.batchEvents().map((e) => e.quantity)).toEqual([3]))
    expect(household.server.batches().map((x) => x.id)).toEqual([id])
  })

  test('removing a batch (undoing its start) takes its events with it', async () => {
    const { b, household, ready } = renderBatches()
    await ready()
    let id = ''
    act(() => void (id = b().startBatch(RAGI).id))
    act(() => void b().addEvent(id, { kind: 'done', stage: 0 }))
    await waitFor(() => expect(household.server.batchEvents()).toHaveLength(1))
    act(() => b().removeBatch(id))
    await waitFor(() => expect(household.server.batches()).toHaveLength(0))
    expect(household.server.batchEvents()).toHaveLength(0)
    await waitFor(() => expect(b().events).toHaveLength(0))
  })
})
