import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { addDays, localDate } from '../lib/dates.ts'
import { renderApp } from '../test/renderApp.tsx'

const OKRA_TA = 'வெண்டைக்காய்'
const today = () => localDate(new Date())

async function openSheet() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Add stock' }))
  return screen.getByRole('dialog', { name: 'Add stock' })
}

describe('Add stock', () => {
  test('search, pick, and save with the usual amount and date already filled in', async () => {
    const { household } = renderApp({ path: '/stock' })
    const sheet = await openSheet()
    fireEvent.change(within(sheet).getByLabelText('Item'), { target: { value: 'okra' } })
    fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(OKRA_TA) }))

    expect((within(sheet).getByLabelText('Amount') as HTMLInputElement).value).toBe('250')
    expect(within(sheet).getByRole('radio', { name: 'g' }).getAttribute('aria-checked')).toBe('true')
    expect((within(sheet).getByLabelText('Use by') as HTMLInputElement).value).toBe(addDays(today(), 5))

    fireEvent.change(within(sheet).getByLabelText('Amount'), { target: { value: '1.5' } })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'kg' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 1.5 kg' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText(`${OKRA_TA}: 1.5 kg added`)).toBeTruthy()
    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    expect(household.server.events()[0]).toMatchObject({ quantity: 1500, reason: 'bought', expires_on: addDays(today(), 5) })
  })

  test('a changed date is kept, and undo takes the purchase back out', async () => {
    const { household } = renderApp({ path: '/stock' })
    const sheet = await openSheet()
    fireEvent.change(within(sheet).getByLabelText('Item'), { target: { value: 'vendakkai' } })
    fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(OKRA_TA) }))
    fireEvent.change(within(sheet).getByLabelText('Use by'), { target: { value: addDays(today(), 1) } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 250 g' }))

    expect(await screen.findByText('Use by tomorrow')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.queryByText(OKRA_TA)).toBeNull())
    await waitFor(() => expect(household.server.events()).toHaveLength(2))
    expect(household.server.events()[0].expires_on).toBe(addDays(today(), 1))
  })

  test('no amount, nothing to save', async () => {
    renderApp({ path: '/stock' })
    const sheet = await openSheet()
    fireEvent.change(within(sheet).getByLabelText('Item'), { target: { value: 'rice' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /அரிசி/ }))
    expect(within(sheet).getByLabelText('Use by (optional)')).toBeTruthy()
    fireEvent.change(within(sheet).getByLabelText('Amount'), { target: { value: '0' } })
    expect((within(sheet).getByRole('button', { name: 'Enter an amount' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('nothing matches: make a new item, stock it, and find it by the same spelling next time', async () => {
    const { household } = renderApp({ path: '/stock' })
    const sheet = await openSheet()
    fireEvent.change(within(sheet).getByLabelText('Item'), { target: { value: 'kathirikai' } })
    expect(within(sheet).getByText('No items match "kathirikai".')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add new item' }))

    const form = screen.getByRole('dialog', { name: 'New item' })
    const create = within(form).getByRole('button', { name: 'Create item' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.change(within(form).getByLabelText('Tamil name'), { target: { value: 'கத்தரிக்காய்' } })
    fireEvent.change(within(form).getByLabelText('English name'), { target: { value: 'Brinjal' } })
    fireEvent.click(create)

    const amount = screen.getByRole('dialog', { name: 'Add stock' })
    fireEvent.click(within(amount).getByRole('button', { name: 'Add 250 g' }))
    await waitFor(() => expect(household.server.events()).toHaveLength(1))
    const saved = household.server.items().find((i) => i.name_en === 'Brinjal')!
    expect(saved).toMatchObject({ name_ta: 'கத்தரிக்காய்', category: 'vegetable', unit: 'g', aliases: ['kathirikai'] })
    expect(household.server.events()[0].item_id).toBe(saved.id)

    fireEvent.change(screen.getByLabelText('Search stock'), { target: { value: 'kathrikkai' } })
    expect(await screen.findByText('கத்தரிக்காய்')).toBeTruthy()
  })

  test('a Stock search that finds nothing goes straight to a new item, named from the search', async () => {
    renderApp({ path: '/stock' })
    fireEvent.change(await screen.findByLabelText('Search stock'), { target: { value: 'Brinjal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add it as a new item' }))
    const form = screen.getByRole('dialog', { name: 'New item' })
    expect((within(form).getByLabelText('English name') as HTMLInputElement).value).toBe('Brinjal')
    // Greens are counted in bunches, unless chosen otherwise.
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'greens' } })
    expect(within(form).getByRole('radio', { name: 'Bunches' }).getAttribute('aria-checked')).toBe('true')
  })

  test('Escape closes the sheet', async () => {
    renderApp({ path: '/stock' })
    await openSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
