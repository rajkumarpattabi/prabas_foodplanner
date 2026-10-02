import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { normaliseVendor } from '../bills/match.ts'
import type { Ocr } from '../bills/ocr.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const NOW = new Date(2026, 9, 2, 11)
const OKRA = 'hh-1:okra'
const COCONUT = 'hh-1:coconut'
const RICE = 'hh-1:rice'
const BILL = ['Murugan Stores', 'Vendakkai 500g 30', 'Coconut 2 pcs 60', 'Rice 5kg 300', 'Tenkai 1 25', 'Carry bag 5', 'Total 420'].join('\n')
const SHOP = normaliseVendor('Murugan Stores')

const fakeOcr = (text: string | Error): Ocr & { read: ReturnType<typeof vi.fn> } => ({
  read: vi.fn(async (_photo: Blob, onProgress?: (f: number, s: 'loading' | 'reading') => void) => {
    onProgress?.(0.5, 'reading')
    if (text instanceof Error) throw text
    return text
  }),
})

function open({ household = fakeHouseholdApi({ withHousehold: true }), ocr = fakeOcr(BILL) as Ocr | null } = {}) {
  renderApp({ path: '/scan', household, now: NOW, ocr })
  return household
}
const photo = async () => fireEvent.change(await screen.findByLabelText('Take a photo'), { target: { files: [new File(['jpeg'], 'bill.jpg', { type: 'image/jpeg' })] } })
const section = (name: string) => screen.findByRole('list', { name })
const row = (list: HTMLElement, text: string) => within(list).getByText(`On the bill: ${text}`).closest('li')!
const stockOf = (h: ReturnType<typeof fakeHouseholdApi>, itemId: string) =>
  h.server
    .events()
    .filter((e) => e.item_id === itemId)
    .reduce((n, e) => n + e.quantity, 0)

describe('scanning a bill', () => {
  test('photo, map the odd names, add everything at once; undo takes the whole bill back', async () => {
    const h = open()
    await photo()
    const map = await section('Needs an item')
    expect(within(map).getByText('“Rice” can mean more than one thing. Which one?')).toBeTruthy()

    // Rice: from the search, which starts with the bill's word.
    fireEvent.click(within(row(map, 'Rice 5kg 300')).getByRole('button', { name: 'Choose item' }))
    let sheet = screen.getByRole('dialog', { name: 'Which item is “Rice”?' })
    fireEvent.click(within(within(sheet).getByRole('list', { name: 'Matching items' })).getByRole('button', { name: /அரிசி/ }))
    // Tenkai: nothing like it; search for coconut instead.
    fireEvent.click(within(row(map, 'Tenkai 1 25')).getByRole('button', { name: 'Choose item' }))
    sheet = screen.getByRole('dialog', { name: 'Which item is “Tenkai”?' })
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'coconut' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /தேங்காய்/ }))
    // Both stay where they were, now ticked, with amounts from the bill.
    expect(within(row(map, 'Rice 5kg 300')).getByRole('checkbox')).toHaveProperty('checked', true)
    expect(within(row(map, 'Rice 5kg 300')).getByLabelText('Amount of அரிசி')).toHaveProperty('value', '5')

    // The rest matched, folded away; not groceries too.
    expect(screen.queryByRole('list', { name: 'Matched' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(within(await section('Matched')).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: 'Not groceries (2) · Show' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add 4 items to stock' }))
    await waitFor(() => expect([stockOf(h, RICE), stockOf(h, OKRA), stockOf(h, COCONUT)]).toEqual([5000, 500, 3]))
    const bill = h.server.bills()[0]
    expect(bill).toMatchObject({ vendor: 'Murugan Stores', bill_date: '2026-10-02', total: 420, lines: 4, created_by: 'user-1' })
    expect(
      h.server
        .events()
        .filter((e) => e.bill_id === bill.id)
        .map((e) => [e.item_id, e.price])
        .sort(),
    ).toEqual([
      [COCONUT, 25],
      [COCONUT, 60],
      [OKRA, 30],
      [RICE, 300],
    ])
    // Remembered: rice for this shop only (it's ambiguous), tenkai for the shop and everywhere.
    await waitFor(() =>
      expect(h.server.billAliases().map((a) => [a.vendor, a.raw, a.item_id]).sort()).toEqual([
        ['', 'tenkai', COCONUT],
        [SHOP, 'rice', RICE],
        [SHOP, 'tenkai', COCONUT],
      ]),
    )
    // Back on Stock, with one undo for the lot.
    expect(await screen.findByRole('heading', { name: 'Stock' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect([stockOf(h, RICE), stockOf(h, OKRA), stockOf(h, COCONUT)]).toEqual([0, 0, 0]))
    await waitFor(() => expect(h.server.bills()).toHaveLength(0))
    await waitFor(() => expect(h.server.billAliases()).toHaveLength(0))
  })

  test('the same bill from the same shop next time: everything matches by itself', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addBillAlias({ vendor: SHOP, raw: 'rice', item_id: RICE })
    household.server.addBillAlias({ vendor: '', raw: 'tenkai', item_id: COCONUT })
    open({ household })
    await photo()
    expect(await screen.findByRole('button', { name: 'Add 4 items to stock' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Needs an item' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Check these' })).toBeNull()
  })

  test('pasted text, an amount changed, a line put back from not groceries', async () => {
    const h = open({ ocr: null })
    // No reader: only the paste box.
    const paste = await screen.findByLabelText('Paste the bill’s text')
    expect(screen.queryByLabelText('Take a photo')).toBeNull()
    fireEvent.change(paste, { target: { value: 'Coconut 2 60\nTotal 60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Read this text' }))
    // Only one line, matched: show it and change the amount.
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))
    fireEvent.change(within(await section('Matched')).getByLabelText('Amount of தேங்காய்'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Not groceries (1) · Show' }))
    fireEvent.click(within(await section('Not groceries')).getByRole('button', { name: 'It’s an item' }))
    // "Total" isn't an item anyone has: it needs one now, and waits unticked.
    expect(within(await section('Needs an item')).getByText('On the bill: Total 60')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 item to stock' }))
    await waitFor(() => expect(stockOf(h, COCONUT)).toBe(3))
  })

  test("a photo that can't be read: say so, and offer the paste box", async () => {
    open({ ocr: fakeOcr(new Error('no')) })
    await photo()
    expect((await screen.findByRole('alert')).textContent).toBe('Couldn’t read this photo. Try again in good light, or paste the text.')
    expect(screen.getByLabelText('Or paste the bill’s text')).toBeTruthy()
  })
})
