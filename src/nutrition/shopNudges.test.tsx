import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const NOW = new Date(2026, 9, 14, 18) // Wednesday 14 Oct 2026

/** A fortnight of plain dosa, with greens, a dal and a millet to buy, and dishes that use them. */
function household({ fortnight = 13 } = {}) {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addItem('murungai_keerai', 'முருங்கைக் கீரை', 'Drumstick leaves', { category: 'greens', unit: 'bunch', display_unit: 'bunch', step: 1 })
  h.server.addItem('thuvaram_paruppu', 'துவரம் பருப்பு', 'Toor dal', { category: 'dal', step: 500 })
  h.server.addItem('ragi_mavu', 'கேழ்வரகு மாவு', 'Ragi flour', { category: 'grain', step: 500 })
  h.server.addDishes(
    { id: 'hh-1:dish:dosai', name_en: 'Dosa', name_ta: 'தோசை', ingredients: [{ item_id: 'hh-1:rice', quantity: 500 }] },
    {
      id: 'hh-1:dish:keerai_poriyal',
      name_en: 'Keerai poriyal',
      name_ta: 'கீரைப் பொரியல்',
      type: 'poriyal',
      meals: ['lunch'],
      is_kids_favourite: true,
      ingredients: [{ item_id: 'hh-1:murungai_keerai', quantity: 2 }],
    },
    { id: 'hh-1:dish:adai', name_en: 'Adai', name_ta: 'அடை', tags: ['protein', 'legume'], ingredients: [{ item_id: 'hh-1:thuvaram_paruppu', quantity: 200 }] },
    { id: 'hh-1:dish:ragi_dosai', name_en: 'Ragi dosa', name_ta: 'கேழ்வரகு தோசை', tags: ['millet'], ingredients: [{ item_id: 'hh-1:ragi_mavu', quantity: 300 }] },
  )
  h.server.addCookedMeals(...Array.from({ length: fortnight }, (_, i) => [addDays('2026-10-13', -i), 'breakfast', ['dosai']] as [string, 'breakfast', string[]]))
  return h
}

const cards = () => screen.queryAllByRole('region').filter((r) => /fortnight|in 2 weeks/.test(r.getAttribute('aria-label') ?? ''))

describe('food-group nudges on the Shop tab', () => {
  test('at most two, for the biggest gaps, each with a one-tap add and a dish idea', async () => {
    renderApp({ path: '/shop', household: household(), now: NOW })
    await screen.findByRole('button', { name: '+ Add item' })
    await waitFor(() => expect(cards()).toHaveLength(2))
    const [legumes, greens] = cards()
    expect(legumes.getAttribute('aria-label')).toBe('Few legumes this fortnight.')
    expect(within(legumes).getByText('For அடை')).toBeTruthy()
    expect(greens.getAttribute('aria-label')).toBe('No keerai in 2 weeks.')
    expect(within(greens).getByText('For கீரைப் பொரியல்')).toBeTruthy()
  })

  test('add from a nudge: on the list, and that gap is in hand (no other greens offered)', async () => {
    const h = household()
    renderApp({ path: '/shop', household: h, now: NOW })
    const greens = await screen.findByRole('region', { name: 'No keerai in 2 weeks.' })
    fireEvent.click(within(greens).getByRole('button', { name: '+ முருங்கைக் கீரை' }))
    expect(await screen.findByText('முருங்கைக் கீரை added to the list')).toBeTruthy()
    await waitFor(() => expect(h.server.shopping()).toMatchObject([{ item_id: 'hh-1:murungai_keerai', kind: 'want' }]))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'No keerai in 2 weeks.' })).toBeNull())
    // The next gap takes its place, still never more than two.
    await waitFor(() => expect(cards().length).toBeLessThanOrEqual(2))
  })

  test('not enough cooking logged: no nudges', async () => {
    renderApp({ path: '/shop', household: household({ fortnight: 5 }), now: NOW })
    await screen.findByRole('button', { name: '+ Add item' })
    expect(cards()).toHaveLength(0)
  })
})
