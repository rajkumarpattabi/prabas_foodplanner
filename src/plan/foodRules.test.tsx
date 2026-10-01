import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL_TA = 'வெண் பொங்கல்'
const EGG_DOSA = 'முட்டை தோசை'

// November 2026: Friday 20, Saturday 21, Sunday 22, Tuesday 24.
const at = (day: number) => new Date(2026, 10, day, 12)

function household() {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addDishes(
    { id: 'hh-1:dish:egg_dosa', name_en: 'Egg dosa', name_ta: EGG_DOSA, is_veg: false, ingredients: [{ item_id: 'hh-1:egg', quantity: 4 }] },
    { id: 'hh-1:dish:egg_thokku', name_en: 'Egg thokku', name_ta: 'முட்டைத் தொக்கு', type: 'chutney', is_veg: false },
    { id: 'hh-1:dish:kara_chutney', name_en: 'Kara chutney', name_ta: 'கார சட்னி', type: 'chutney' },
  )
  return h
}

async function openBreakfast(now: Date, h = household()) {
  renderApp({ now, path: '/plan', household: h })
  fireEvent.click(await screen.findByRole('radio', { name: 'Today' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Breakfast' }))
  await screen.findAllByRole('article')
  return h
}

const cards = () => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))
const anyNonVeg = () => screen.getAllByRole('article').some((a) => within(a).queryByText('Non-veg'))

describe('veg-only days never show non-veg', () => {
  test('a Saturday', async () => {
    await openBreakfast(at(21))
    expect(screen.getByRole('link', { name: 'Saturday · veg only' }).getAttribute('href')).toBe('/calendar')
    expect(cards()).not.toContain(EGG_DOSA)
    expect(anyNonVeg()).toBe(false)
  })

  test('the Friday before is a normal day: no chip, egg dosa is back', async () => {
    await openBreakfast(at(20))
    expect(screen.queryByRole('link', { name: /veg only|Non-veg day/ })).toBeNull()
    expect(cards()).toContain(EGG_DOSA)
  })

  test('an Amavasai, even one not yet confirmed', async () => {
    const h = household()
    h.server.addCalendarDays({ date: '2026-11-24', type: 'amavasai' })
    await openBreakfast(at(24), h)
    expect(screen.getByRole('link', { name: 'Amavasai (check date) · veg only' })).toBeTruthy()
    expect(cards()).not.toContain(EGG_DOSA)
  })

  test('any day of Puratasi', async () => {
    const h = household()
    h.server.addCalendarDays({ date: '2026-11-10', end_date: '2026-11-30', type: 'puratasi', verified: true })
    await openBreakfast(at(20), h)
    expect(screen.getByRole('link', { name: 'Puratasi · veg only' })).toBeTruthy()
    expect(cards()).not.toContain(EGG_DOSA)
    expect(anyNonVeg()).toBe(false)
  })

  test('no non-veg leftover is offered, and no non-veg side to swap in', async () => {
    const h = household()
    h.server.otherPhoneAddsLeftover({ dish_id: 'hh-1:dish:muttai_kuzhambu', name_ta: 'முட்டைக் குழம்பு', name_en: 'Egg kuzhambu', servings: 2, expires_on: '2026-11-22' })
    await openBreakfast(at(21), h)
    const pongal = screen.getByRole('article', { name: PONGAL_TA })
    expect(within(pongal).queryByText(/leftover/)).toBeNull()
    fireEvent.click(within(pongal).getByRole('button', { name: 'தேங்காய் சட்னி' }))
    const options = within(screen.getByRole('dialog')).getByRole('list', { name: 'Other sides' })
    expect(within(options).queryByText('முட்டைத் தொக்கு')).toBeNull()
    expect(within(options).getByText('கார சட்னி')).toBeTruthy()
  })
})

describe('non-veg days', () => {
  test('Sunday is a non-veg day: the chip says so, and so does a non-veg card', async () => {
    await openBreakfast(at(22))
    expect(screen.getByRole('link', { name: 'Non-veg day' })).toBeTruthy()
    expect(within(screen.getByRole('article', { name: EGG_DOSA })).getByText(/Non-veg day/)).toBeTruthy()
  })

  test('a leftover non-veg gravy is back on a non-veg day', async () => {
    const h = household()
    h.server.otherPhoneAddsLeftover({ dish_id: 'hh-1:dish:muttai_kuzhambu', name_ta: 'முட்டைக் குழம்பு', name_en: 'Egg kuzhambu', servings: 2, expires_on: '2026-11-23' })
    await openBreakfast(at(22), h)
    expect(within(screen.getByRole('article', { name: PONGAL_TA })).getAllByText(/leftover/).length).toBeGreaterThan(0)
  })
})

describe('a plan that clashes with the rules', () => {
  test('a non-veg plan on what is a veg-only day is flagged, not hidden', async () => {
    const h = household()
    h.server.otherPhonePutsMeal({ date: '2026-11-21', meal: 'breakfast', dish_ids: ['hh-1:dish:egg_dosa'] })
    renderApp({ now: at(21), path: '/plan', household: h })
    fireEvent.click(await screen.findByRole('radio', { name: 'Today' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Breakfast' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Non-veg on a veg-only day (Saturday). Change it?'))
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
  })
})
