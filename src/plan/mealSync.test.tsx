import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { useDishes, type DishState } from '../dishes/dishContext.ts'
import { DishProvider } from '../dishes/DishProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { StockProvider } from '../stock/StockProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { comboFor } from './combos.ts'
import { useMeals, type MealState } from './mealContext.ts'
import { MealProvider } from './MealProvider.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const SAMBAR = 'hh-1:dish:kathirikkai_sambar'
const CHUTNEY = 'hh-1:dish:thengai_chutney'
const DATE = '2026-10-02'
const ID = `hh-1:${DATE}:breakfast`

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0

function renderMeals({
  household = fakeHouseholdApi({ withHousehold: true }),
  sync = createSync(household.execute, `prabas-meal-test-${++dbCount}`),
}: { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync } = {}) {
  const current: { meals: MealState | null; dishes: DishState | null } = { meals: null, dishes: null }
  function Probe() {
    const meals = useMeals()
    const dishes = useDishes()
    useEffect(() => {
      current.meals = meals
      current.dishes = dishes
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <StockProvider api={household.stockApi} householdId="hh-1" userId="user-1">
          <DishProvider api={household.dishApi} householdId="hh-1" userId="user-1">
            <MealProvider api={household.mealApi} householdId="hh-1" userId="user-1">
              <Probe />
            </MealProvider>
          </DishProvider>
        </StockProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const meals = () => current.meals!
  const pongal = () => comboFor(current.dishes!.dishesById.get(PONGAL)!, current.dishes!.dishesById)
  const ready = () =>
    waitFor(() => {
      expect(meals().status).toBe('ready')
      expect(current.dishes!.status).toBe('ready')
    })
  return { ...result, household, sync, meals, pongal, ready }
}

describe('meals on this phone', () => {
  test('plan: shows at once and is saved as planned by me', async () => {
    const { meals, pongal, household, ready } = renderMeals()
    await ready()
    act(() => meals().planMeal(DATE, 'breakfast', pongal()))
    await waitFor(() => expect(meals().mealFor(DATE, 'breakfast')?.status).toBe('planned'))
    await waitFor(() =>
      expect(household.server.meals().find((m) => m.id === ID)).toMatchObject({
        status: 'planned',
        dish_ids: [PONGAL, SAMBAR, CHUTNEY],
        created_by: 'user-1',
      }),
    )
    expect(household.server.meals()[0].dish_names.map((n) => n.name_en)).toEqual(['Ven pongal', 'Brinjal sambar', 'Coconut chutney'])
  })

  test('cook, then undo back to the plan, or back to nothing', async () => {
    const { meals, pongal, household, ready } = renderMeals()
    await ready()
    act(() => meals().planMeal(DATE, 'breakfast', pongal()))
    await waitFor(() => expect(meals().mealFor(DATE, 'breakfast')).toBeTruthy())

    let before: ReturnType<MealState['cookMeal']> = null
    act(() => {
      before = meals().cookMeal(DATE, 'breakfast', pongal())
    })
    expect(before).toMatchObject({ status: 'planned' })
    await waitFor(() => expect(household.server.meals().find((m) => m.id === ID)).toMatchObject({ status: 'cooked', cooked_by: 'user-1' }))
    expect(household.server.meals()[0].cooked_at).toBeTruthy()

    act(() => meals().restoreMeal(DATE, 'breakfast', before))
    await waitFor(() => expect(household.server.meals().find((m) => m.id === ID)).toMatchObject({ status: 'planned', cooked_at: null }))
    act(() => meals().restoreMeal(DATE, 'breakfast', null))
    await waitFor(() => expect(household.server.meals()).toHaveLength(0))
  })

  test('a plan made offline survives reopening and is saved when back online', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const first = renderMeals({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => first.meals().planMeal(DATE, 'breakfast', first.pongal()))
    await waitFor(() => expect(first.meals().mealFor(DATE, 'breakfast')).toBeTruthy())
    first.unmount()

    const second = renderMeals({ household, sync: first.sync })
    await second.ready()
    expect(second.meals().mealFor(DATE, 'breakfast')?.status).toBe('planned')
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.meals()).toHaveLength(1))
  })

  test('leftovers: added, eaten, and un-eaten', async () => {
    const { meals, household, ready } = renderMeals({})
    await ready()
    const dishes = () => household.server.dishes()
    let id = ''
    act(() => {
      ;[{ id }] = meals().addLeftovers([{ dish: dishes().find((d) => d.id === SAMBAR)!, servings: 2, expires_on: '2026-10-03', meal_id: null }])
    })
    await waitFor(() => expect(household.server.leftovers()).toMatchObject([{ id, name_en: 'Brinjal sambar', servings: 2, eaten_at: null }]))
    act(() => meals().setLeftoverEaten(id, true))
    await waitFor(() => expect(household.server.leftovers()[0]).toMatchObject({ eaten_by: 'user-1' }))
    act(() => meals().setLeftoverEaten(id, false))
    await waitFor(() => expect(household.server.leftovers()[0].eaten_at).toBeNull())
  })
})

describe('two phones', () => {
  test("the other phone's plan shows up live", async () => {
    const { meals, household, ready } = renderMeals()
    await ready()
    act(() => void household.server.otherPhonePutsMeal({ date: DATE, meal: 'breakfast', dish_ids: [PONGAL] }))
    await waitFor(() => expect(meals().mealFor(DATE, 'breakfast')).toMatchObject({ created_by: 'user-2', status: 'planned' }))
  })

  test('both plan the same meal: one record, and the later change wins', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const { meals, pongal, ready } = renderMeals({ household })
    await ready()
    // The other phone planned first, but this phone hadn't heard yet (offline).
    household.setOffline(true)
    household.server.otherPhonePutsMeal({ date: DATE, meal: 'breakfast', dish_ids: [SAMBAR] })
    act(() => meals().planMeal(DATE, 'breakfast', pongal()))
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.meals().find((m) => m.id === ID)?.dish_ids).toEqual([PONGAL, SAMBAR, CHUTNEY]))
    expect(household.server.meals()).toHaveLength(1)
    expect(household.server.meals()[0].created_by).toBe('user-2')
  })

  test("the other phone's leftovers show up live", async () => {
    const { meals, household, ready } = renderMeals()
    await ready()
    act(() => void household.server.otherPhoneAddsLeftover({ dish_id: SAMBAR, name_ta: 'சாம்பார்', name_en: 'Sambar', servings: 3, expires_on: '2026-10-03' }))
    await waitFor(() => expect(meals().leftovers).toHaveLength(1))
  })
})
