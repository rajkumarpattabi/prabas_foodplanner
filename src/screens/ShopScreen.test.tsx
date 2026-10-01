import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const NOW = new Date(2026, 9, 5, 18) // Monday 5 Oct 2026, before dinner
const RICE = 'hh-1:rice'
const RICE_TA = 'அரிசி'
const EGG_TA = 'முட்டை'
const OKRA_TA = 'வெண்டைக்காய்'

afterEach(() => vi.restoreAllMocks())

function open(household = fakeHouseholdApi({ withHousehold: true })) {
  renderApp({ path: '/shop', household, now: NOW })
  return household
}
const section = (name: string) => screen.findByRole('list', { name })
const row = (list: HTMLElement, name: string) => within(list).getByText(name).closest('li')!
const stockOf = (h: ReturnType<typeof fakeHouseholdApi>, itemId: string) =>
  h.server
    .events()
    .filter((e) => e.item_id === itemId)
    .reduce((n, e) => n + e.quantity, 0)

describe('the Shop tab', () => {
  test('a staple that is out: tick it off, say how much, and it is in stock at once; undo takes it back', async () => {
    const h = open()
    const low = await section('Running low')
    expect(within(row(low, RICE_TA)).getByText('Out')).toBeTruthy()
    fireEvent.click(within(low).getByRole('button', { name: `Bought ${RICE_TA}` }))
    const sheet = screen.getByRole('dialog', { name: `Bought ${RICE_TA}` })
    expect(within(sheet).getByLabelText('Amount')).toHaveProperty('value', '1')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 1 kg' }))
    await waitFor(() => expect(stockOf(h, RICE)).toBe(1000))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Running low' })).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(stockOf(h, RICE)).toBe(0))
    expect(await section('Running low')).toBeTruthy()
  })

  test('bought on the other phone: the line goes, here too', async () => {
    const h = open()
    await section('Running low')
    act(() =>
      void h.server.otherPhoneRecords({
        id: 'other-rice',
        item_id: RICE,
        kind: 'delta',
        quantity: 5000,
        reason: 'bought',
        batch_id: null,
        expires_on: null,
        form: 'whole',
        note: null,
        occurred_at: NOW.toISOString(),
      }),
    )
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Running low' })).toBeNull())
  })

  test('a planned meal: what it needs, how much, and for which meal; the sheet offers enough', async () => {
    const h = fakeHouseholdApi({ withHousehold: true })
    h.server.otherPhonePutsMeal({ date: '2026-10-06', meal: 'lunch', dish_ids: ['hh-1:dish:muttai_kuzhambu'] })
    open(h)
    const planned = await section('For planned meals')
    const egg = row(planned, EGG_TA)
    expect(within(egg).getByText('8 pieces')).toBeTruthy()
    expect(within(egg).getByText("For முட்டைக் குழம்பு · tomorrow's lunch")).toBeTruthy()
    fireEvent.click(within(egg).getByRole('button', { name: `Bought ${EGG_TA}` }))
    expect(within(screen.getByRole('dialog', { name: `Bought ${EGG_TA}` })).getByLabelText(/^Amount/)).toHaveProperty('value', '8')
  })

  test('skip a line: gone for a few days; undo brings it back', async () => {
    const h = open()
    const low = await section('Running low')
    fireEvent.click(within(row(low, RICE_TA)).getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Running low' })).toBeNull())
    await waitFor(() => expect(h.server.shopping()).toMatchObject([{ kind: 'skip', item_id: RICE, section: 'low' }]))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await section('Running low')).toBeTruthy()
    await waitFor(() => expect(h.server.shopping()).toHaveLength(0))
  })

  test('add by hand from a Tamil search; tick it off and it is bought for both', async () => {
    const h = open()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add item' }))
    const sheet = screen.getByRole('dialog', { name: 'Add to the list' })
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'வெண்டை' } })
    fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(OKRA_TA) }))
    const added = await section('Added')
    expect(within(row(added, OKRA_TA)).getByText('Added by you')).toBeTruthy()
    await waitFor(() => expect(h.server.shopping()).toMatchObject([{ kind: 'want', created_by: 'user-1' }]))

    fireEvent.click(within(added).getByRole('button', { name: `Bought ${OKRA_TA}` }))
    fireEvent.click(within(screen.getByRole('dialog', { name: `Bought ${OKRA_TA}` })).getByRole('button', { name: 'Add 250 g' }))
    await waitFor(() => expect(h.server.shopping()[0]).toMatchObject({ done_by: 'user-1' }))
    expect(stockOf(h, 'hh-1:okra')).toBe(250)
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Added' })).toBeNull())
  })

  test('remove something added by hand, with undo', async () => {
    const h = fakeHouseholdApi({ withHousehold: true })
    h.server.otherPhoneShops({ item_id: 'hh-1:okra' })
    open(h)
    const added = await section('Added')
    expect(within(row(added, OKRA_TA)).getByText('Added by Amma')).toBeTruthy()
    fireEvent.click(within(row(added, OKRA_TA)).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Added' })).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await section('Added')).toBeTruthy()
  })

  test('share: the phone’s share sheet gets the list, in both scripts', async () => {
    const shared = vi.fn<(data: ShareData) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'share', { configurable: true, value: shared })
    open()
    await section('Running low')
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(shared).toHaveBeenCalled())
    expect(shared.mock.calls[0][0].text).toContain(`Running low\n• ${RICE_TA} Rice`)
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  })

  test('no share sheet: WhatsApp and Copy instead', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    open()
    await section('Running low')
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const sheet = screen.getByRole('dialog', { name: 'Share the list' })
    expect(within(sheet).getByRole('link', { name: 'Open WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=Shopping/)
  })
})
