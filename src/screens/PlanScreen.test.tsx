import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const PONGAL_TA = 'வெண் பொங்கல்'
const today = () => localDate(new Date())

/** Open the Plan tab on today's breakfast (or another meal). */
async function openPlan(household = fakeHouseholdApi({ withHousehold: true }), meal = 'Breakfast') {
  renderApp({ path: '/plan', household })
  fireEvent.click(await screen.findByRole('radio', { name: 'Today' }))
  fireEvent.click(screen.getByRole('radio', { name: meal }))
  return household
}

const cards = () => screen.queryAllByRole('article').map((a) => a.getAttribute('aria-label'))
const card = (name: string) => screen.getByRole('article', { name })

describe('Plan tab', () => {
  test('a suggestion card: the main in both scripts, its sides, and when it was last cooked', async () => {
    await openPlan()
    const pongal = await screen.findByRole('article', { name: PONGAL_TA })
    expect(within(pongal).getByText('Ven pongal')).toBeTruthy()
    expect(within(pongal).getByRole('img', { name: 'Tiffin' })).toBeTruthy()
    const sides = within(within(pongal).getByRole('list', { name: 'Sides' })).getAllByRole('button')
    expect(sides.map((b) => b.textContent)).toEqual(['கத்தரிக்காய் சாம்பார்', 'தேங்காய் சட்னி'])
    expect(within(pongal).getByText('Not cooked yet')).toBeTruthy()
    expect(within(pongal).getByText('Veg')).toBeTruthy()
  })

  test('a meal with nothing to suggest says so', async () => {
    await openPlan(undefined, 'Lunch')
    expect(await screen.findByText('No dishes for lunch yet. Add some on the Dishes tab.')).toBeTruthy()
  })

  test('tap a side to swap it for another', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addDishes({ id: 'hh-1:dish:kara_chutney', name_en: 'Kara chutney', name_ta: 'கார சட்னி', type: 'chutney' })
    await openPlan(household)
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'தேங்காய் சட்னி' }))
    const sheet = screen.getByRole('dialog', { name: 'Instead of தேங்காய் சட்னி' })
    fireEvent.click(within(sheet).getByRole('button', { name: /கார சட்னி/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(card(PONGAL_TA)).getByRole('button', { name: 'கார சட்னி' })).toBeTruthy()
  })

  test('suggestions change once a dish is cooked', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addDishes({ id: 'hh-1:dish:idli', name_en: 'Idli', name_ta: 'இட்லி', side_ids: [`hh-1:dish:kathirikkai_sambar`] })
    await openPlan(household)
    await screen.findByRole('article', { name: PONGAL_TA })
    const first = cards()[0]
    act(() =>
      void household.server.otherPhonePutsMeal({
        date: today(),
        meal: 'lunch',
        dish_ids: [first === PONGAL_TA ? PONGAL : 'hh-1:dish:idli'],
        status: 'cooked',
        cooked_at: new Date().toISOString(),
      }),
    )
    await waitFor(() => expect(cards()[0]).not.toBe(first))
    expect(within(card(first!)).getByText('Cooked today')).toBeTruthy()
  })

  test('a leftover gravy is suggested with tiffin', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhoneAddsLeftover({
      dish_id: 'hh-1:dish:muttai_kuzhambu',
      name_ta: 'முட்டைக் குழம்பு',
      name_en: 'Egg kuzhambu',
      servings: 2,
      expires_on: addDays(today(), 1),
    })
    await openPlan(household)
    const pongal = await screen.findByRole('article', { name: PONGAL_TA })
    expect(within(pongal).getByRole('button', { name: /^முட்டைக் குழம்பு\s*· leftover$/ })).toBeTruthy()
    expect(within(pongal).getByText(/Uses leftover முட்டைக் குழம்பு/)).toBeTruthy()
  })

  test('three at a time, a bring-back card, and more ideas', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addDishes(
      ...['Idli', 'Dosa', 'Upma', 'Adai', 'Pesarattu', 'Uthappam'].map((name_en) => ({ id: `hh-1:dish:${name_en}`, name_en })),
    )
    await openPlan(household)
    // Pongal needs rice, and there's none in stock, so it ranks below these.
    await screen.findAllByRole('article')
    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByText('Bring back?')).toBeTruthy()
    const firstPage = cards()
    fireEvent.click(screen.getByRole('button', { name: 'More ideas' }))
    expect(cards().slice(0, 3)).not.toEqual(firstPage.slice(0, 3))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the best ideas' }))
    expect(cards()).toEqual(firstPage)
  })

  test('the day and meal can be changed', async () => {
    renderApp({ path: '/plan' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Tomorrow' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dinner' }))
    expect(screen.getByRole('radio', { name: 'Tomorrow' }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByText('No dishes for dinner yet. Add some on the Dishes tab.')).toBeTruthy()
  })
})

describe('planning', () => {
  const MEAL_ID = () => `hh-1:${today()}:breakfast`
  const plannedCard = () => screen.getByRole('article', { name: PONGAL_TA })

  test('plan this: shows as planned by me, is saved, and can be undone', async () => {
    const household = await openPlan()
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'Plan this' }))

    expect(await screen.findByText(`${PONGAL_TA} planned for today's breakfast`)).toBeTruthy()
    await waitFor(() => expect(within(plannedCard()).getByText('Planned by you · just now')).toBeTruthy())
    expect(within(plannedCard()).getByRole('button', { name: 'Change' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan this' })).toBeNull()
    await waitFor(() =>
      expect(household.server.meals().find((m) => m.id === MEAL_ID())).toMatchObject({ status: 'planned', created_by: 'user-1' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(household.server.meals()).toHaveLength(0))
    expect(await screen.findByRole('button', { name: 'Plan this' })).toBeTruthy()
  })

  test("the other phone's plan shows instead of suggestions", async () => {
    const household = await openPlan()
    await screen.findByRole('button', { name: 'Plan this' })
    act(() => void household.server.otherPhonePutsMeal({ date: today(), meal: 'breakfast', dish_ids: [PONGAL, 'hh-1:dish:thengai_chutney'] }))
    expect(await screen.findByText('Planned by Amma · just now')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Plan this' })).toBeNull()
    expect(within(plannedCard()).getByRole('button', { name: 'தேங்காய் சட்னி' })).toBeTruthy()
  })

  test('change the plan, or keep it', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addDishes({ id: 'hh-1:dish:idli', name_en: 'Idli', name_ta: 'இட்லி', side_ids: ['hh-1:dish:thengai_chutney'] })
    household.server.otherPhonePutsMeal({ date: today(), meal: 'breakfast', dish_ids: [PONGAL] })
    await openPlan(household)
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    expect(screen.getByText("Pick a new plan for today's breakfast")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep the plan' }))
    expect(screen.getByText(/^Planned by Amma/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.click(within(screen.getByRole('article', { name: 'இட்லி' })).getByRole('button', { name: 'Plan this' }))
    await waitFor(() => expect(household.server.meals()[0].dish_ids).toEqual(['hh-1:dish:idli', 'hh-1:dish:thengai_chutney']))
    expect(await screen.findByText('Planned by you · just now')).toBeTruthy()
    // Changing someone else's plan is saved cleanly, with nothing refused.
    expect(household.execute.mock.results.length).toBeGreaterThan(0)
    for (const r of household.execute.mock.results) expect(await r.value).toEqual({ status: 'ok' })
    expect(screen.queryByText(/couldn't be saved/)).toBeNull()
  })

  test('remove the plan, with undo', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhonePutsMeal({ date: today(), meal: 'breakfast', dish_ids: [PONGAL] })
    await openPlan(household)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(await screen.findByText("Plan for today's breakfast removed")).toBeTruthy()
    await waitFor(() => expect(household.server.meals()).toHaveLength(0))
    expect(await screen.findByRole('button', { name: 'Plan this' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(household.server.meals()).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Change' })).toBeTruthy()
  })

  test('swap a side on the planned meal', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addDishes({ id: 'hh-1:dish:kara_chutney', name_en: 'Kara chutney', name_ta: 'கார சட்னி', type: 'chutney' })
    household.server.otherPhonePutsMeal({ date: today(), meal: 'breakfast', dish_ids: [PONGAL, 'hh-1:dish:thengai_chutney'] })
    await openPlan(household)
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'தேங்காய் சட்னி' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /கார சட்னி/ }))
    await waitFor(() => expect(household.server.meals()[0].dish_ids).toEqual([PONGAL, 'hh-1:dish:kara_chutney']))
  })

  test('a cooked meal says who cooked it, with no plan buttons', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.otherPhonePutsMeal({
      date: today(),
      meal: 'breakfast',
      dish_ids: [PONGAL],
      status: 'cooked',
      cooked_by: 'user-2',
      cooked_at: new Date().toISOString(),
    })
    await openPlan(household)
    expect(await screen.findByText('Cooked by Amma · just now')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Plan this' })).toBeNull()
  })
})

describe('switching', () => {
  test('the day and meal can be switched back and forth', async () => {
    renderApp({ path: '/plan' })
    fireEvent.click(await screen.findByRole('radio', { name: 'Tomorrow' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dinner' }))
    expect(screen.getByRole('radio', { name: 'Tomorrow' }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByText('No dishes for dinner yet. Add some on the Dishes tab.')).toBeTruthy()
  })
})
