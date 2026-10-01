import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

// Monday 5 Oct 2026. Tue 6, Wed 7, Thu 8 Oct.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const RAGI = 'கேழ்வரகுக் கூழ்'
const BATTER = 'இட்லி தோசை மாவு'

function setup(start: Date) {
  const household = fakeHouseholdApi({ withHousehold: true })
  household.server.addPrepared()
  const time = { now: start }
  const app = renderApp({ path: '/plan', household, clock: () => new Date(time.now) })
  /** Move the clock, as when coming back to the app later. */
  const moveTo = (d: Date) => act(() => {
    time.now = d
    window.dispatchEvent(new Event('focus'))
  })
  const card = (name: string) => screen.getByRole('article', { name })
  const detail = (name: string) => card(name).querySelector('p:nth-of-type(2)')!.textContent
  const press = (name: string, button: string) => fireEvent.click(within(card(name)).getByRole('button', { name: button }))
  const stock = (key: string) =>
    household.server
      .events()
      .filter((e) => e.item_id.endsWith(`:${key}`))
      .reduce((n, e) => n + e.quantity, 0)
  return { ...app, household, moveTo, card, detail, press, stock }
}

async function planRagiForThursday() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Start a batch' }))
  const sheet = screen.getByRole('dialog', { name: 'Start a batch' })
  fireEvent.click(within(sheet).getByRole('button', { name: new RegExp(RAGI) }))
  const form = screen.getByRole('dialog', { name: `Start ${RAGI}` })
  fireEvent.change(within(form).getByLabelText('Day'), { target: { value: '2026-10-08' } })
  fireEvent.click(within(form).getByRole('radio', { name: 'Breakfast' }))
  expect(within(form).getByLabelText('Ferment for (hours)')).toHaveProperty('value', '24')
  expect(within(form).getByText('Soak tomorrow 9 pm · ready Thu 7 am')).toBeTruthy()
  fireEvent.click(within(form).getByRole('button', { name: 'Plan it' }))
}

describe('a ragi koozh batch on the Plan tab', () => {
  test('moves through every stage with the right prompts, and its glasses count down', async () => {
    const { household, moveTo, card, detail, press, stock } = setup(at(5, 18))
    await planRagiForThursday()
    expect(await screen.findByText(`${RAGI} planned · soak tomorrow 9 pm`)).toBeTruthy()
    await screen.findByRole('article', { name: RAGI })
    expect(detail(RAGI)).toBe('Soak tomorrow 9 pm · ready Thu 7 am')
    await waitFor(() => expect(household.server.batches()).toHaveLength(1))

    // Tuesday night: soak now, which takes the ragi from stock.
    moveTo(at(6, 21, 5))
    expect(detail(RAGI)).toBe('Soak now · ready Thu 7:05 am')
    press(RAGI, 'Soaked')
    const soak = screen.getByRole('dialog', { name: `Soak ${RAGI}` })
    expect(within(within(soak).getByRole('list', { name: 'Take from stock' })).getByText('கேழ்வரகு மாவு')).toBeTruthy()
    fireEvent.click(within(soak).getByRole('button', { name: 'Soaked · take from stock' }))
    expect(await screen.findByText(`${RAGI} soaked · stock updated`)).toBeTruthy()
    await waitFor(() => expect(stock('ragi_mavu')).toBe(600))
    await waitFor(() => expect(detail(RAGI)).toBe('Soaking · cook tomorrow 6:05 am'))

    // Wednesday morning: cook. Nothing more to take.
    moveTo(at(7, 6, 10))
    expect(detail(RAGI)).toBe('Cook now · ready tomorrow 7:10 am')
    press(RAGI, 'Cooked')
    await waitFor(() => expect(detail(RAGI)).toBe('Cooling · ready tomorrow 7:10 am'))
    moveTo(at(7, 9))
    expect(detail(RAGI)).toBe('Fermenting · ready tomorrow 7:10 am')
    expect(within(card(RAGI)).getByRole('button', { name: '+2 hours' })).toBeTruthy()
    expect(stock('ragi_mavu')).toBe(600)

    // Thursday: ready, 10 glasses, counting down from both phones.
    moveTo(at(8, 7, 30))
    expect(detail(RAGI)).toBe('10 glasses left · keeps till Sun 7:10 am')
    press(RAGI, 'Had a glass')
    await waitFor(() => expect(detail(RAGI)).toBe('9 glasses left · keeps till Sun 7:10 am'))
    press(RAGI, 'Had a glass')
    await waitFor(() => expect(detail(RAGI)).toBe('8 glasses left · keeps till Sun 7:10 am'))
    await waitFor(() => expect(household.server.batchEvents().filter((e) => e.kind === 'used')).toHaveLength(2))
    act(() => void household.server.otherPhoneAddsBatchEvent({ batch_id: household.server.batches()[0].id, kind: 'used', quantity: 7 }))
    await waitFor(() => expect(detail(RAGI)).toBe('1 glass left · keeps till Sun 7:10 am'))
    expect(card(RAGI).className).toContain('bg-turmeric-fill')

    // The last glass: it's finished, and leaves the strip.
    press(RAGI, 'Had a glass')
    await waitFor(() => expect(screen.queryByRole('article', { name: RAGI })).toBeNull())
    expect(screen.queryByRole('heading', { name: 'In progress' })).toBeNull()
  })

  test('a late step: red, with the new ready time; shift the times, or undo that', async () => {
    const { moveTo, card, detail, press } = setup(at(5, 18))
    await planRagiForThursday()
    await screen.findByRole('article', { name: RAGI })
    moveTo(at(7, 0, 30))
    expect(detail(RAGI)).toBe('Soak: 3 hours late · now ready tomorrow 10:30 am')
    expect(card(RAGI).className).toContain('bg-red-fill')
    press(RAGI, 'Shift times')
    await waitFor(() => expect(detail(RAGI)).toBe('Soak now · ready tomorrow 10:30 am'))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(detail(RAGI)).toBe('Soak: 3 hours late · now ready tomorrow 10:30 am'))
  })

  test('undoing a soak puts the stock back', async () => {
    const { moveTo, detail, press, stock } = setup(at(5, 18))
    await planRagiForThursday()
    await screen.findByRole('article', { name: RAGI })
    moveTo(at(6, 21))
    press(RAGI, 'Soaked')
    fireEvent.click(screen.getByRole('button', { name: 'Soaked · take from stock' }))
    await waitFor(() => expect(stock('ragi_mavu')).toBe(600))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(stock('ragi_mavu')).toBe(1000))
    await waitFor(() => expect(detail(RAGI)).toBe('Soak now · ready Thu 7 am'))
  })
})

describe('batter', () => {
  test('start now: soak at once, and the stock is taken', async () => {
    const { detail, stock } = setup(at(5, 16))
    fireEvent.click(await screen.findByRole('button', { name: '+ Start a batch' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Start a batch' })).getByRole('button', { name: new RegExp(BATTER) }))
    const form = screen.getByRole('dialog', { name: `Start ${BATTER}` })
    fireEvent.click(within(form).getByRole('radio', { name: 'Start now' }))
    expect(within(form).getByText('Ready tomorrow 7 am')).toBeTruthy()
    fireEvent.click(within(form).getByRole('button', { name: 'Soak now' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: `Soak ${BATTER}` })).getByRole('button', { name: 'Soaked · take from stock' }))
    await waitFor(() => expect(stock('idli_arisi')).toBe(0))
    await waitFor(() => expect(detail(BATTER)).toBe('Soaking · grind 9 pm'))
  })

  test('the last meal of batter asks to grind more, and starts the next', async () => {
    const household = fakeHouseholdApi({ withHousehold: true })
    household.server.addPrepared()
    const hid = household.server.household()!.id
    household.server.addBatch(
      {
        id: 'b-old',
        dish_id: `${hid}:dish:idli_dosa_batter`,
        name_ta: BATTER,
        name_en: 'Idli/dosa batter',
        stages: [
          { key: 'soak', hours: 5, action: true, takes_ingredients: true },
          { key: 'grind', hours: 0, action: true },
          { key: 'ferment', hours: 10, action: false, adjustable: true },
        ],
        planned_start: at(4, 16).toISOString(),
        yield: 4,
        unit: 'meals',
        keeps_days: 3,
      },
      [
        { kind: 'done', stage: 0, occurred_at: at(4, 16).toISOString() },
        { kind: 'done', stage: 1, occurred_at: at(4, 21).toISOString() },
        { kind: 'used', quantity: 3, occurred_at: at(5, 8).toISOString() },
      ],
    )
    renderApp({ path: '/plan', household, now: at(5, 12) })
    const card = await screen.findByRole('article', { name: BATTER })
    expect(within(card).getByText('1 meal left · grind more tonight?')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Start the next' }))
    const form = screen.getByRole('dialog', { name: `Start ${BATTER}` })
    // It learned from the batch before: 10 hours.
    expect(within(form).getByLabelText('Ferment for (hours)')).toHaveProperty('value', '10')
  })
})
