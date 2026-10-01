import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

// Wednesday 14 Oct 2026, before breakfast.
const NOW = new Date(2026, 9, 14, 6)
const DOSA = 'தோசை'
const ADAI = 'அடை'

/** Plain dosa every breakfast for a fortnight; adai cooked once, a while back. */
function household({ fortnight = 13 } = {}) {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addDishes(
    { id: 'hh-1:dish:dosai', name_en: 'Dosa', name_ta: DOSA, meals: ['breakfast'], ingredients: [{ item_id: 'hh-1:rice', quantity: 500 }] },
    { id: 'hh-1:dish:adai', name_en: 'Adai', name_ta: ADAI, meals: ['breakfast'], tags: ['protein', 'legume'], ingredients: [{ item_id: 'hh-1:rice', quantity: 200 }] },
  )
  h.server.addCookedMeals(
    ...Array.from({ length: fortnight }, (_, i) => [addDays('2026-10-13', -i), 'breakfast', ['dosai']] as [string, 'breakfast', string[]]),
    ['2026-09-20', 'breakfast', ['adai']],
  )
  return h
}

const card = (name: string) => screen.findByRole('article', { name })

describe('suggestions with the fortnight’s food groups', () => {
  test('adai fills the legume gap: the why line says so', async () => {
    renderApp({ path: '/plan', household: household(), now: NOW })
    expect(within(await card(ADAI)).getByText(/Adds legumes \(none in 2 weeks\)/)).toBeTruthy()
  })

  test('plain dosa: "More legumes: try adai", one tap switches the card, and undo switches back', async () => {
    renderApp({ path: '/plan', household: household(), now: NOW })
    const dosa = await card(DOSA)
    fireEvent.click(within(dosa).getByRole('button', { name: `More legumes: try ${ADAI}` }))
    expect(await screen.findByText(`Switched to ${ADAI}`)).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('article', { name: DOSA })).toBeNull())
    // One card for adai, not two.
    expect(screen.getAllByRole('article', { name: ADAI })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await card(DOSA)).toBeTruthy()
  })

  test('not enough cooking logged yet: no swap ideas, no nutrition why lines', async () => {
    renderApp({ path: '/plan', household: household({ fortnight: 5 }), now: NOW })
    const dosa = await card(DOSA)
    expect(within(dosa).queryByRole('button', { name: /More legumes/ })).toBeNull()
    expect(within(await card(ADAI)).queryByText(/Adds legumes/)).toBeNull()
  })
})
