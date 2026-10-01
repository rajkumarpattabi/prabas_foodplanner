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
