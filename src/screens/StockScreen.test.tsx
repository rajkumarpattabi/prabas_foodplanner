import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const OKRA = 'hh-1:okra'
const OKRA_TA = 'வெண்டைக்காய்'
const RICE_TA = 'அரிசி'

let n = 0
function bought(household: ReturnType<typeof fakeHouseholdApi>, itemId: string, quantity: number, expiresInDays?: number) {
  return household.server.otherPhoneRecords({
    id: `seed-${++n}`,
    item_id: itemId,
    kind: 'delta',
    quantity,
    reason: 'bought',
    batch_id: null,
    expires_on: expiresInDays === undefined ? null : addDays(localDate(new Date()), expiresInDays),
    form: 'whole',
    note: null,
    occurred_at: new Date(Date.now() - 3_600_000).toISOString(),
  })
}

const rowOf = (name: string) => screen.getByText(name).closest('li')!

function swipeLeft(el: Element, { dy = 0 } = {}) {
  const surface = el.querySelector('[style]')!
  fireEvent.pointerDown(surface, { clientX: 300, clientY: 20, pointerId: 1 })
  fireEvent.pointerMove(surface, { clientX: 280, clientY: 20 + dy / 4, pointerId: 1 })
  fireEvent.pointerMove(surface, { clientX: 150, clientY: 20 + dy, pointerId: 1 })
  fireEvent.pointerUp(surface, { clientX: 150, clientY: 20 + dy, pointerId: 1 })
}

describe('Stock screen', () => {
  test('staples that are out show under Running low; other items only once stocked', async () => {
    renderApp({ path: '/stock' })
    const low = (await screen.findByRole('heading', { name: 'Running low' })).parentElement!
    expect(within(low).getByText(RICE_TA)).toBeTruthy()
    expect(within(low).getByText('Out')).toBeTruthy()
    expect(screen.queryByText(OKRA_TA)).toBeNull()
  })

  test('search in Tanglish, then + adds a step and is saved', async () => {
    const { household } = renderApp({ path: '/stock' })
    fireEvent.change(await screen.findByLabelText('Search stock'), { target: { value: 'vendakai' } })
    fireEvent.click(screen.getByRole('button', { name: `Add 250 g of ${OKRA_TA}` }))

    expect(await screen.findByText(`${OKRA_TA}: 250 g`)).toBeTruthy()
    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    expect(household.server.events()[0]).toMatchObject({ item_id: OKRA, quantity: 250, reason: 'bought', created_by: 'user-1' })

    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /All good · 1 item fine/ }))
    expect(within(rowOf(OKRA_TA)).getByText('Fresh · 5 days')).toBeTruthy()
  })

  test('swipe to use up, then undo brings back each purchase with its own date', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, OKRA, 1000, 1)
    bought(household, OKRA, 500, 5)
    renderApp({ path: '/stock', household })

    await screen.findByText(OKRA_TA)
    expect(within(rowOf(OKRA_TA)).getByText('1.5 kg')).toBeTruthy()
    expect(within(rowOf(OKRA_TA)).getByText('Use by tomorrow')).toBeTruthy()

    swipeLeft(rowOf(OKRA_TA))
    expect(await screen.findByText(`${OKRA_TA} used up`)).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(OKRA_TA)).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText(OKRA_TA)
    expect(within(rowOf(OKRA_TA)).getByText('1.5 kg')).toBeTruthy()
    expect(within(rowOf(OKRA_TA)).getByText('Use by tomorrow')).toBeTruthy()
    // Nothing was deleted: the use and its undo are both events.
    await waitFor(() => expect(household.server.events()).toHaveLength(5))
  })

  test('− takes a step, and undo puts it back', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, OKRA, 1000, 1)
    renderApp({ path: '/stock', household })

    fireEvent.click(await screen.findByRole('button', { name: `Remove 250 g of ${OKRA_TA}` }))
    expect(await screen.findByText(`${OKRA_TA}: 750 g`)).toBeTruthy()
    await waitFor(() => expect(within(rowOf(OKRA_TA)).getByText('750 g')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(within(rowOf(OKRA_TA)).getByText('1 kg')).toBeTruthy())
    await waitFor(() => expect(household.server.events().at(-1)).toMatchObject({ quantity: 250, note: 'undo' }))
  })

  test("the other phone's change shows up live", async () => {
    const { household } = renderApp({ path: '/stock' })
    await screen.findByRole('heading', { name: 'Running low' })
    act(() => void bought(household, OKRA, 500, 1))
    expect(await screen.findByText(OKRA_TA)).toBeTruthy()
  })

  test('a mostly vertical drag scrolls instead of using up', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, OKRA, 1000, 1)
    renderApp({ path: '/stock', household })
    await screen.findByText(OKRA_TA)

    swipeLeft(rowOf(OKRA_TA), { dy: 200 })
    expect(screen.queryByText(`${OKRA_TA} used up`)).toBeNull()
    expect(household.server.events()).toHaveLength(1)
  })
})
