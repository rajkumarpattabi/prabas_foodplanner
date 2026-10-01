import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { shortDate } from '../stock/history.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const today = () => localDate(new Date())
const SAMBAR = 'hh-1:dish:kathirikkai_sambar'

function withLeftover(expiresInDays = 1) {
  const household = fakeHouseholdApi({ withHousehold: true })
  household.server.otherPhoneAddsLeftover({
    dish_id: SAMBAR,
    name_ta: 'கத்தரிக்காய் சாம்பார்',
    name_en: 'Brinjal sambar',
    servings: 2,
    expires_on: addDays(today(), expiresInDays),
  })
  return household
}

describe('Ready to eat', () => {
  test('leftovers show on the Stock tab, and Eaten clears them, with undo', async () => {
    const household = withLeftover()
    renderApp({ path: '/stock', household })
    const section = await screen.findByRole('list', { name: 'Ready to eat' })
    expect(within(section).getByText('கத்தரிக்காய் சாம்பார்')).toBeTruthy()
    expect(within(section).getByText('2 servings')).toBeTruthy()
    expect(within(section).getByText('Eat by tomorrow')).toBeTruthy()
    expect(screen.queryByText(/Nothing in stock yet/)).toBeNull()

    fireEvent.click(within(section).getByRole('button', { name: 'Eaten' }))
    expect(await screen.findByText('கத்தரிக்காய் சாம்பார் eaten')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Ready to eat' })).toBeNull())
    await waitFor(() => expect(household.server.leftovers()[0].eaten_by).toBe('user-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('list', { name: 'Ready to eat' })).toBeTruthy()
    await waitFor(() => expect(household.server.leftovers()[0].eaten_at).toBeNull())
  })

  test('change how long it is good for', async () => {
    const household = withLeftover(0)
    renderApp({ path: '/stock', household })
    const section = await screen.findByRole('list', { name: 'Ready to eat' })
    expect(within(section).getByText('Eat today')).toBeTruthy()
    fireEvent.change(within(section).getByLabelText('Good until, for கத்தரிக்காய் சாம்பார்'), { target: { value: addDays(today(), 3) } })
    await waitFor(() => expect(within(section).getByText('Good for 3 days')).toBeTruthy())
    await waitFor(() => expect(household.server.leftovers()[0].expires_on).toBe(addDays(today(), 3)))
  })

  test('leftovers from the other phone appear live', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    renderApp({ path: '/stock', household })
    await screen.findByRole('heading', { name: 'Running low' })
    act(
      () =>
        void household.server.otherPhoneAddsLeftover({
          dish_id: SAMBAR,
          name_ta: 'கத்தரிக்காய் சாம்பார்',
          name_en: 'Brinjal sambar',
          servings: 1,
          expires_on: today(),
        }),
    )
    expect(await screen.findByText('1 serving')).toBeTruthy()
  })
})

describe('cooking history on the dish sheet', () => {
  test('how many times, and when and by whom, newest first', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    const cooked = (daysAgo: number, by: string) =>
      household.server.otherPhonePutsMeal({
        date: addDays(today(), -daysAgo),
        meal: 'breakfast',
        dish_ids: ['hh-1:dish:ven_pongal', SAMBAR],
        status: 'cooked',
        cooked_by: by,
        cooked_at: new Date().toISOString(),
      })
    cooked(10, 'user-2')
    cooked(3, 'user-1')
    renderApp({ path: '/dishes', household })
    fireEvent.click(await screen.findByRole('button', { name: /கத்தரிக்காய் சாம்பார்/ }))
    const sheet = screen.getByRole('dialog', { name: 'கத்தரிக்காய் சாம்பார்' })
    expect(await within(sheet).findByText('Cooked 2 times')).toBeTruthy()
    const lines = within(within(sheet).getByRole('list', { name: 'Cooking history' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual([
      `Breakfast · ${shortDate(addDays(today(), -3))} · cooked by you`,
      `Breakfast · ${shortDate(addDays(today(), -10))} · cooked by Amma`,
    ])
  })
})
