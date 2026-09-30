import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const OKRA = 'hh-1:okra'
const OKRA_TA = 'வெண்டைக்காய்'
const COCONUT = 'hh-1:coconut'
const COCONUT_TA = 'தேங்காய்'
const today = () => localDate(new Date())

let n = 0
function bought(household: ReturnType<typeof fakeHouseholdApi>, itemId: string, quantity: number, expiresInDays: number | null) {
  return household.server.otherPhoneRecords({
    id: `seed-${++n}`,
    item_id: itemId,
    kind: 'delta',
    quantity,
    reason: 'bought',
    batch_id: null,
    expires_on: expiresInDays === null ? null : addDays(today(), expiresInDays),
    form: 'whole',
    note: null,
    occurred_at: new Date(Date.now() - 3_600_000).toISOString(),
  })
}

/** Okra with two purchases, bought by Amma on the other phone. */
async function openOkra() {
  const household = fakeHouseholdApi({ withHousehold: true })
  bought(household, OKRA, 1000, 1)
  bought(household, OKRA, 500, 5)
  renderApp({ path: '/stock', household })
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${OKRA_TA}`) }))
  return { household, sheet: screen.getByRole('dialog', { name: OKRA_TA }) }
}

describe('item detail', () => {
  test('shows the total, each purchase with its date, and who did what', async () => {
    const { sheet } = await openOkra()
    expect(within(sheet).getByText('1.5 kg')).toBeTruthy()
    expect(within(sheet).getByText('Use by tomorrow')).toBeTruthy()
    expect((within(sheet).getByLabelText(/^Use by, for 1 kg/) as HTMLInputElement).value).toBe(addDays(today(), 1))
    expect((within(sheet).getByLabelText(/^Use by, for 500 g/) as HTMLInputElement).value).toBe(addDays(today(), 5))
    const history = within(sheet).getByRole('list', { name: 'History' })
    expect(within(history).getAllByText(/^Bought/)).toHaveLength(2)
    expect(within(history).getAllByText('Updated by Amma · 1 hour ago')).toHaveLength(2)
  })

  test('changing a purchase date is saved, and undo puts the old date back', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.change(within(sheet).getByLabelText(/^Use by, for 1 kg/), { target: { value: addDays(today(), 3) } })

    // The soonest date is now 3 days away: fine for now.
    await waitFor(() => expect(within(sheet).getByText('Fresh · 3 days')).toBeTruthy())
    await waitFor(() => expect(household.server.events().at(-1)).toMatchObject({ kind: 'expiry', expires_on: addDays(today(), 3) }))
    expect(within(sheet).getByText('Use-by date changed to ' + short(addDays(today(), 3)))).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(within(sheet).getByText('Use by tomorrow')).toBeTruthy())
  })

  test('correct to a number', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Correct to…' }))
    const form = screen.getByRole('dialog', { name: `Correct ${OKRA_TA}` })
    expect((within(form).getByLabelText('There is now') as HTMLInputElement).value).toBe('1500')
    fireEvent.change(within(form).getByLabelText('There is now'), { target: { value: '300' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Set to 300 g' }))

    const back = screen.getByRole('dialog', { name: OKRA_TA })
    expect(await screen.findByText(`${OKRA_TA}: 300 g`)).toBeTruthy()
    await waitFor(() => expect(within(back).getByText('Corrected to 300 g')).toBeTruthy())
    expect(within(back).getAllByText('Updated by you · just now').length).toBeGreaterThan(0)
    await waitFor(() => expect(household.server.events().at(-1)).toMatchObject({ kind: 'set', quantity: 300, reason: 'correction' }))
  })

  test('spoiled starts with the purchase expiring first, and does not count as use', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Spoiled…' }))
    const form = screen.getByRole('dialog', { name: `Spoiled ${OKRA_TA}` })
    fireEvent.click(within(form).getByRole('button', { name: 'Remove 1 kg' }))

    expect(await screen.findByText(`${OKRA_TA}: 500 g left`)).toBeTruthy()
    await waitFor(() => expect(household.server.events().at(-1)).toMatchObject({ quantity: -1000, reason: 'spoiled' }))
  })

  test('bought more from the detail sheet', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Bought…' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: `Bought ${OKRA_TA}` })).getByRole('button', { name: 'Add 250 g' }))
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: OKRA_TA })).getByText('1.75 kg')).toBeTruthy())
    await waitFor(() => expect(household.server.events()).toHaveLength(3))
  })

  test('open one coconut: the opened one gets the shorter shelf life', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    bought(household, COCONUT, 2, 30)
    renderApp({ path: '/stock', household })
    fireEvent.click(await screen.findByRole('button', { name: /All good/ }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${COCONUT_TA}`) }))
    const sheet = screen.getByRole('dialog', { name: COCONUT_TA })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open one' }))

    await waitFor(() => expect(within(sheet).getByText('1 piece opened')).toBeTruthy())
    expect((within(sheet).getByLabelText(/^Use by, for 1 piece opened/) as HTMLInputElement).value).toBe(addDays(today(), 3))
    await waitFor(() => expect(household.server.events().at(-1)).toMatchObject({ kind: 'open', quantity: 1 }))
  })
})

describe('editing an item', () => {
  test('saves only the changes, and undo puts them back', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit item' }))
    const form = screen.getByRole('dialog', { name: `Edit ${OKRA_TA}` })
    fireEvent.change(within(form).getByLabelText('English name'), { target: { value: 'Okra' } })
    fireEvent.change(within(form).getByLabelText('Other names'), { target: { value: 'okra, vendakkai, bhindi' } })
    fireEvent.click(within(form).getByLabelText('Staple (always keep some)'))
    fireEvent.change(within(form).getByLabelText('+/− step (g)'), { target: { value: '500' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(household.server.items().find((i) => i.id === OKRA)).toMatchObject({
        name_en: 'Okra',
        aliases: ['okra', 'vendakkai', 'bhindi'],
        is_staple: true,
        step: 500,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(household.server.items().find((i) => i.id === OKRA)).toMatchObject({ name_en: 'Ladies finger', is_staple: false, step: 250 }),
    )
  })

  test('explains what to fix', async () => {
    const { sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit item' }))
    const form = screen.getByRole('dialog', { name: `Edit ${OKRA_TA}` })
    fireEvent.change(within(form).getByLabelText('Shelf life (days)'), { target: { value: 'soon' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    expect(within(form).getByRole('alert').textContent).toBe('Shelf life is a number of days.')
  })

  test('remove from list, with undo', async () => {
    const { household, sheet } = await openOkra()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from list' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(screen.queryByText(OKRA_TA)).toBeNull())
    await waitFor(() => expect(household.server.items().find((i) => i.id === OKRA)?.archived).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText(OKRA_TA)).toBeTruthy()
  })
})

const short = (d: string) => new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
