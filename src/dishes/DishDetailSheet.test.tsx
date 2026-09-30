import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const PONGAL = 'hh-1:dish:ven_pongal'
const PONGAL_TA = 'வெண் பொங்கல்'

function bought(household: ReturnType<typeof fakeHouseholdApi>, itemId: string, quantity: number) {
  household.server.otherPhoneRecords({
    id: `seed-${itemId}`,
    item_id: itemId,
    kind: 'delta',
    quantity,
    reason: 'bought',
    batch_id: null,
    expires_on: null,
    form: 'whole',
    note: null,
    occurred_at: new Date().toISOString(),
  })
}

async function openDish(name: string, household = fakeHouseholdApi({ withHousehold: true })) {
  renderApp({ path: '/dishes', household })
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
  return { household, sheet: screen.getByRole('dialog', { name }) }
}

describe('dish detail', () => {
  test('shows the dish, its sides in rank order, ingredients for 5, and no cooking yet', async () => {
    const { sheet } = await openDish(PONGAL_TA)
    expect(within(sheet).getByText('Ven pongal')).toBeTruthy()
    expect(within(sheet).getByText('Tiffin · Breakfast')).toBeTruthy()
    const sides = within(sheet).getAllByRole('listitem').filter((li) => li.closest('ol'))
    expect(sides.map((li) => li.querySelector('.font-medium')!.textContent)).toEqual(['கத்தரிக்காய் சாம்பார்', 'தேங்காய் சட்னி'])
    const ingredients = await within(sheet).findByRole('list', { name: 'Ingredients' })
    expect(await within(ingredients).findByText('அரிசி')).toBeTruthy()
    expect(within(ingredients).getByText('400 g')).toBeTruthy()
    expect(within(sheet).getByText('Not cooked yet')).toBeTruthy()
  })

  test('each ingredient says whether there is enough in stock', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, 'hh-1:rice', 5000)
    const { sheet: pongal } = await openDish(PONGAL_TA, household)
    expect(await within(pongal).findByText('In stock')).toBeTruthy()
    fireEvent.click(within(pongal).getByRole('button', { name: /தேங்காய் சட்னி/ }))
    const chutney = screen.getByRole('dialog', { name: 'தேங்காய் சட்னி' })
    expect(await within(chutney).findByText('Not in stock')).toBeTruthy()
  })

  test('tapping a side opens it, with a way back', async () => {
    const { sheet } = await openDish(PONGAL_TA)
    fireEvent.click(within(sheet).getByRole('button', { name: /கத்தரிக்காய் சாம்பார்/ }))
    const sambar = screen.getByRole('dialog', { name: 'கத்தரிக்காய் சாம்பார்' })
    expect(within(sambar).getByText('No sides yet.')).toBeTruthy()
    fireEvent.click(within(sambar).getByRole('button', { name: `← Back to ${PONGAL_TA}` }))
    expect(screen.getByRole('dialog', { name: PONGAL_TA })).toBeTruthy()
  })

  test('favourite applies at once, is saved, and can be undone', async () => {
    const { household, sheet } = await openDish(PONGAL_TA)
    const favourite = within(sheet).getByRole('switch', { name: 'Favourite' }) as HTMLInputElement
    fireEvent.click(favourite)
    expect(await screen.findByText(`${PONGAL_TA} marked as a favourite`)).toBeTruthy()
    await waitFor(() => expect(favourite.checked).toBe(true))
    await waitFor(() => expect(household.server.dishes().find((d) => d.id === PONGAL)?.is_favourite).toBe(true))
    // The badge joins the switch's label.
    expect(within(sheet).getAllByText('Favourite')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(household.server.dishes().find((d) => d.id === PONGAL)?.is_favourite).toBe(false))
    await waitFor(() => expect(favourite.checked).toBe(false))
  })

  test("don't suggest: the list marks it, and the Not suggested filter finds it", async () => {
    const { sheet } = await openDish(PONGAL_TA)
    fireEvent.click(within(sheet).getByRole('switch', { name: "Don't suggest" }))
    expect(await screen.findByText(`${PONGAL_TA} won't be suggested`)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Not suggested', pressed: false }))
    await waitFor(() => expect(screen.getByText('1 dish')).toBeTruthy())
  })

  test('a side deleted on the other phone drops out of the list', async () => {
    const { household, sheet } = await openDish(PONGAL_TA)
    household.server.otherPhoneDeletesDish('hh-1:dish:thengai_chutney')
    await waitFor(() => expect(within(sheet).queryByText('தேங்காய் சட்னி')).toBeNull())
    expect(within(sheet).getByText('கத்தரிக்காய் சாம்பார்')).toBeTruthy()
  })
})
