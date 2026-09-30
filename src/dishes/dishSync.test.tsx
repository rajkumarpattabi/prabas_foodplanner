import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { StockProvider } from '../stock/StockProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { useDishes, type DishState } from './dishContext.ts'
import { DishProvider } from './DishProvider.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const SAMBAR = 'hh-1:dish:kathirikkai_sambar'
const CHUTNEY = 'hh-1:dish:thengai_chutney'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0

/** Dishes on one phone (user-1), against the fake server. */
function renderDishes({
  household = fakeHouseholdApi({ withHousehold: true }),
  sync = createSync(household.execute, `prabas-dish-test-${++dbCount}`),
}: { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync } = {}) {
  const current: { state: DishState | null } = { state: null }
  function Probe() {
    const state = useDishes()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <StockProvider api={household.stockApi} householdId="hh-1" userId="user-1">
          <DishProvider api={household.dishApi} householdId="hh-1" userId="user-1">
            <Probe />
          </DishProvider>
        </StockProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const dishes = () => current.state!
  const dish = (id: string) => dishes().dishesById.get(id)
  const ready = () => waitFor(() => expect(dishes().status).toBe('ready'))
  return { ...result, household, sync, dishes, dish, ready }
}

describe('dishes on this phone', () => {
  test('load from the server, with ranked sides', async () => {
    const { dish, ready } = renderDishes()
    await ready()
    expect(dish(PONGAL)?.side_ids).toEqual([SAMBAR, CHUTNEY])
    expect(dish('hh-1:dish:muttai_kuzhambu')?.is_veg).toBe(false)
  })

  test('favourite: shows at once and is saved', async () => {
    const { dishes, dish, household, ready } = renderDishes()
    await ready()
    act(() => dishes().updateDish(PONGAL, { is_favourite: true }))
    await waitFor(() => expect(dish(PONGAL)?.is_favourite).toBe(true))
    await waitFor(() => expect(household.server.dishes().find((d) => d.id === PONGAL)?.is_favourite).toBe(true))
  })

  test('veg or not follows the ingredients: adding egg makes a dish non-veg', async () => {
    const { dishes, dish, household, ready } = renderDishes()
    await ready()
    act(() => dishes().updateDish(PONGAL, { ingredients: [...dish(PONGAL)!.ingredients, { item_id: 'hh-1:egg', quantity: 2, optional: true }] }))
    await waitFor(() => expect(dish(PONGAL)?.is_veg).toBe(false))
    await waitFor(() => expect(household.server.dishes().find((d) => d.id === PONGAL)?.is_veg).toBe(false))
  })

  test('a new dish is saved as its maker, and worked out as veg', async () => {
    const { dishes, household, ready } = renderDishes()
    await ready()
    act(() => {
      dishes().addDish({ name_ta: 'கொள்ளு ரசம்', name_en: 'Kollu rasam', type: 'rasam', meals: ['lunch'] })
    })
    await waitFor(() => expect(household.server.dishes().find((d) => d.name_en === 'Kollu rasam')).toMatchObject({ created_by: 'user-1', is_veg: true }))
  })

  test('delete: gone here and on the server, and out of other dishes’ sides', async () => {
    const { dishes, dish, household, ready } = renderDishes()
    await ready()
    act(() => dishes().deleteDish(SAMBAR))
    await waitFor(() => expect(dish(SAMBAR)).toBeUndefined())
    expect(dish(PONGAL)?.side_ids).toEqual([CHUTNEY])
    await waitFor(() => expect(household.server.dishes().some((d) => d.id === SAMBAR)).toBe(false))
    expect(household.server.dishes().find((d) => d.id === PONGAL)?.side_ids).toEqual([CHUTNEY])
  })

  test('a delete made offline waits, survives reopening and a reload, and is sent when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderDishes({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => first.dishes().deleteDish(SAMBAR))
    await waitFor(() => expect(first.dish(SAMBAR)).toBeUndefined())
    first.unmount()

    const second = renderDishes({ household, sync: first.sync })
    await second.ready()
    expect(second.dish(SAMBAR)).toBeUndefined()
    // The server can be read again, but the delete hasn't been sent yet.
    const execute = household.execute.getMockImplementation()!
    household.execute.mockImplementation(async () => ({ status: 'retry' }))
    household.setOffline(false)
    await act(() => second.dishes().reload())
    expect(second.dish(SAMBAR)).toBeUndefined()

    household.execute.mockImplementation(execute)
    setOnline(true)
    await waitFor(() => expect(household.server.dishes().some((d) => d.id === SAMBAR)).toBe(false))
  })
})

describe('two phones', () => {
  test("the other phone's edit and delete show up live", async () => {
    const { dish, household, ready } = renderDishes()
    await ready()
    act(() => household.server.otherPhoneEditsDish(PONGAL, { dont_suggest: true }))
    await waitFor(() => expect(dish(PONGAL)?.dont_suggest).toBe(true))
    act(() => household.server.otherPhoneDeletesDish(CHUTNEY))
    await waitFor(() => expect(dish(CHUTNEY)).toBeUndefined())
    await waitFor(() => expect(dish(PONGAL)?.side_ids).toEqual([SAMBAR]))
  })

  test('a live edit to a dish deleted here does not bring it back', async () => {
    const { dishes, dish, household, ready } = renderDishes()
    await ready()
    household.execute.mockImplementation(async () => ({ status: 'retry' }))
    act(() => dishes().deleteDish(CHUTNEY))
    await waitFor(() => expect(dish(CHUTNEY)).toBeUndefined())
    act(() => household.server.otherPhoneEditsDish(CHUTNEY, { is_favourite: true }))
    // Give the live update time to arrive.
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(dish(CHUTNEY)).toBeUndefined()
  })
})
