import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const NOW = new Date(2026, 9, 14, 18) // Wednesday 14 Oct 2026; the week began Mon 12

/** Plain dosa every breakfast; keerai poriyal for lunch on Monday; adai known but not had. */
function household({ fortnight = 13 } = {}) {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addItem('murungai_keerai', 'முருங்கைக் கீரை', 'Drumstick leaves', { category: 'greens', unit: 'bunch', display_unit: 'bunch', step: 1 })
  h.server.addDishes(
    { id: 'hh-1:dish:dosai', name_en: 'Dosa', name_ta: 'தோசை', ingredients: [{ item_id: 'hh-1:rice', quantity: 500 }] },
    { id: 'hh-1:dish:keerai', name_en: 'Keerai poriyal', name_ta: 'கீரைப் பொரியல்', type: 'poriyal', meals: ['lunch'], ingredients: [{ item_id: 'hh-1:murungai_keerai', quantity: 2 }] },
    { id: 'hh-1:dish:adai', name_en: 'Adai', name_ta: 'அடை', tags: ['protein', 'legume'], is_kids_favourite: true },
  )
  h.server.addCookedMeals(
    ...Array.from({ length: fortnight }, (_, i) => [addDays('2026-10-13', -i), 'breakfast', ['dosai']] as [string, 'breakfast', string[]]),
    ['2026-10-12', 'lunch', ['keerai']],
  )
  return h
}

const row = (name: string) => within(screen.getByRole('list', { name: 'Food groups' })).getByText(name).closest('li')!

describe('food balance', () => {
  test('the Plan card sums up the week, and opens the full view', async () => {
    renderApp({ path: '/plan', household: household(), now: NOW })
    const card = await screen.findByRole('link', { name: 'This week: protein in 0 of 3 meals · greens on 1 day' })
    fireEvent.click(card)
    expect(await screen.findByRole('heading', { name: 'Food balance' })).toBeTruthy()
  })

  test('each group this week, and over the last 14 days, with what is short and a dish for it', async () => {
    renderApp({ path: '/balance', household: household(), now: NOW })
    await screen.findByRole('list', { name: 'Food groups' })
    expect(screen.getByText('Mon 12 Oct to Wed 14 Oct · 3 meals cooked')).toBeTruthy()
    expect(within(row('Greens')).getByText('On 1 day · last Mon')).toBeTruthy()
    expect(within(row('Greens')).getByText('Good')).toBeTruthy()
    expect(within(row('Legumes')).getByText('0 of 3 meals')).toBeTruthy()
    expect(within(row('Legumes')).getByText('Short')).toBeTruthy()
    expect(within(row('Vegetables')).getByText('0 different')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Last 14 days' }))
    expect(within(row('Legumes')).getByText('0 of 14 meals')).toBeTruthy()
    expect(within(row('Greens')).getByText('Short')).toBeTruthy()
    const short = screen.getByRole('list', { name: 'Short this fortnight' })
    // Only gaps with a dish to try, at most three: legumes, protein, greens (no fish dish here).
    expect(within(short).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Few legumes this fortnight. Try அடை for legumes.',
      'Few protein-rich meals this fortnight. Try அடை for protein.',
      'Few greens this fortnight. Try கீரைப் பொரியல் for greens.',
    ])
  })

  test('not enough cooking yet: says so, instead of gaps', async () => {
    renderApp({ path: '/balance', household: household({ fortnight: 4 }), now: NOW })
    expect(await screen.findByText('This fills in as you cook. Gaps show once there are 10 cooked meals over at least a week.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Short this fortnight' })).toBeNull()
  })
})
