import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const PONGAL_TA = 'வெண் பொங்கல்'
const today = () => localDate(new Date())

let n = 0
function bought(household: ReturnType<typeof fakeHouseholdApi>, itemId: string, quantity: number) {
  household.server.otherPhoneRecords({
    id: `seed-${++n}`,
    item_id: itemId,
    kind: 'delta',
    quantity,
    reason: 'bought',
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: new Date(Date.now() - 60_000).toISOString(),
  })
}

/** A household with rice and a coconut in stock, on today's breakfast. */
async function openBreakfast(setup: (h: ReturnType<typeof fakeHouseholdApi>) => void = () => {}) {
  const household = fakeHouseholdApi({ withHousehold: true })
  bought(household, 'hh-1:rice', 5000)
  bought(household, 'hh-1:coconut', 1)
  setup(household)
  renderApp({ path: '/plan', household })
  fireEvent.click(await screen.findByRole('radio', { name: 'Today' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Breakfast' }))
  return household
}

const sheet = () => screen.getByRole('dialog')
const cookedEvents = (h: ReturnType<typeof fakeHouseholdApi>) => h.server.events().filter((e) => e.reason === 'cooked')

describe('cooking', () => {
  test('take from stock, line by line; then save leftovers', async () => {
    const household = await openBreakfast()
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'Cook this' }))
    expect(screen.getByRole('dialog', { name: `Cook ${PONGAL_TA}` })).toBeTruthy()
    const lines = within(sheet()).getByRole('list', { name: 'Take from stock' })
    expect(within(lines).getByText('அரிசி')).toBeTruthy()
    expect(within(lines).getByText('தேங்காய்')).toBeTruthy()

    // A little more rice, and keep the coconut.
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Change amount of அரிசி' }))
    fireEvent.change(within(sheet()).getByLabelText('Amount'), { target: { value: '0.5' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Use 500 g' }))
    fireEvent.click(within(sheet()).getByRole('checkbox', { name: 'Take தேங்காய்' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cooked · take from stock' }))

    expect(await screen.findByText(`${PONGAL_TA} cooked · stock updated`)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Anything left over?' })).toBeTruthy()
    await waitFor(() => expect(cookedEvents(household)).toMatchObject([{ item_id: 'hh-1:rice', quantity: -500 }]))
    await waitFor(() =>
      expect(household.server.meals().find((m) => m.id === `hh-1:${today()}:breakfast`)).toMatchObject({
        status: 'cooked',
        cooked_by: 'user-1',
        dish_ids: [PONGAL, 'hh-1:dish:kathirikkai_sambar', 'hh-1:dish:thengai_chutney'],
      }),
    )

    fireEvent.click(within(sheet()).getByRole('button', { name: 'More servings of கத்தரிக்காய் சாம்பார்' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'More servings of கத்தரிக்காய் சாம்பார்' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Save leftovers' }))
    expect(await screen.findByText('1 leftover saved')).toBeTruthy()
    await waitFor(() =>
      expect(household.server.leftovers()).toMatchObject([
        { dish_id: 'hh-1:dish:kathirikkai_sambar', servings: 2, expires_on: addDays(today(), 1), meal_id: `hh-1:${today()}:breakfast` },
      ]),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Cooked by you · just now')).toBeTruthy()
  })

  test('undo puts the stock back exactly and the meal back as it was', async () => {
    const household = await openBreakfast()
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'Cook this' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cooked · take from stock' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'No leftovers' }))

    await waitFor(() => expect(household.server.meals()).toHaveLength(0))
    // Rice and coconut: taken, then put back into the same purchases.
    await waitFor(() => expect(household.server.events().filter((e) => e.note === 'undo')).toHaveLength(2))
    const total = (id: string) => household.server.events().filter((e) => e.item_id === id).reduce((s, e) => s + e.quantity, 0)
    expect(total('hh-1:rice')).toBe(5000)
    expect(total('hh-1:coconut')).toBe(1)
    expect(await screen.findByRole('button', { name: 'Plan this' })).toBeTruthy()
  })

  test('short stock is shown, and never more than there is is taken', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, 'hh-1:rice', 100)
    renderApp({ path: '/plan', household })
    fireEvent.click(await screen.findByRole('radio', { name: 'Today' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Breakfast' }))
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'Cook this' }))
    expect(within(sheet()).getByText("Only 100 g in stock: that's what will be taken")).toBeTruthy()
    expect(within(sheet()).getByText('None in stock: nothing will be taken')).toBeTruthy()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cooked · take from stock' }))
    await waitFor(() => expect(cookedEvents(household)).toMatchObject([{ item_id: 'hh-1:rice', quantity: -100 }]))
  })

  test('cook a planned meal', async () => {
    const household = await openBreakfast((h) => h.server.otherPhonePutsMeal({ date: today(), meal: 'breakfast', dish_ids: [PONGAL] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cook this' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cooked · take from stock' }))
    await waitFor(() => expect(household.server.meals()[0]).toMatchObject({ status: 'cooked', cooked_by: 'user-1', created_by: 'user-2' }))
  })

  test('a leftover side is finished, and nothing is taken for it', async () => {
    const household = await openBreakfast((h) => {
      bought(h, 'hh-1:egg', 10)
      h.server.otherPhoneAddsLeftover({
        dish_id: 'hh-1:dish:muttai_kuzhambu',
        name_ta: 'முட்டைக் குழம்பு',
        name_en: 'Egg kuzhambu',
        servings: 2,
        expires_on: addDays(today(), 1),
      })
    })
    fireEvent.click(within(await screen.findByRole('article', { name: PONGAL_TA })).getByRole('button', { name: 'Cook this' }))
    expect(within(sheet()).getByText('Uses the leftover முட்டைக் குழம்பு: nothing to take for it.')).toBeTruthy()
    expect(within(sheet()).queryByText('முட்டை')).toBeNull()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Cooked · take from stock' }))
    await waitFor(() => expect(household.server.leftovers()[0].eaten_by).toBe('user-1'))
    expect(cookedEvents(household).some((e) => e.item_id === 'hh-1:egg')).toBe(false)
  })
})
