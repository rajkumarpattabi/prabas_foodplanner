import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'
import type { PrepStage } from './types.ts'

// Monday 5 Oct 2026, before breakfast.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const NOW = at(5, 7)
const BATTER = 'இட்லி தோசை மாவு'
const DOSA = 'தோசை'
const RAGI = 'கேழ்வரகுக் கூழ்'

const BATTER_STAGES: PrepStage[] = [
  { key: 'soak', hours: 5, action: true, takes_ingredients: true },
  { key: 'grind', hours: 0, action: true },
  { key: 'ferment', hours: 10, action: false, adjustable: true },
]
const RAGI_STAGES: PrepStage[] = [
  { key: 'soak', hours: 9, action: true, takes_ingredients: true },
  { key: 'cook', hours: 1, action: true },
  { key: 'ferment', hours: 24, action: false, adjustable: true },
]

/** A household with batter (and koozh, if asked) ready since `readyDay` 7 am. */
function household({ batter = true, ragi = false, readyDay = 5 } = {}) {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addPrepared()
  const hid = h.server.household()!.id
  if (batter) {
    h.server.addBatch(
      { id: 'b-batter', dish_id: `${hid}:dish:idli_dosa_batter`, name_ta: BATTER, name_en: 'Idli/dosa batter', stages: BATTER_STAGES, planned_start: at(readyDay - 1, 16).toISOString(), yield: 4, unit: 'meals', keeps_days: 3 },
      [
        { kind: 'done', stage: 0, occurred_at: at(readyDay - 1, 16).toISOString() },
        { kind: 'done', stage: 1, occurred_at: at(readyDay - 1, 21).toISOString() },
      ],
    )
  }
  if (ragi) {
    h.server.addBatch(
      { id: 'b-ragi', dish_id: `${hid}:dish:ragi_koozh`, name_ta: RAGI, name_en: 'Ragi koozh', stages: RAGI_STAGES, planned_start: at(3, 21).toISOString(), yield: 10, unit: 'glasses', keeps_days: 3 },
      [
        { kind: 'done', stage: 0, occurred_at: at(3, 21).toISOString() },
        { kind: 'done', stage: 1, occurred_at: at(4, 6).toISOString() },
      ],
    )
  }
  return h
}

const stock = (h: ReturnType<typeof household>, key: string) =>
  h.server
    .events()
    .filter((e) => e.item_id.endsWith(`:${key}`))
    .reduce((n, e) => n + e.quantity, 0)
const used = (h: ReturnType<typeof household>, batchId: string) => h.server.batchEvents().filter((e) => e.batch_id === batchId && e.kind === 'used')

/** A suggestion card (not the batch of the same name in the strip). */
const card = (name: string) => screen.queryAllByRole('article', { name }).find((a) => !a.closest('section[aria-labelledby="in-progress"]'))

/** Find a suggestion for breakfast, paging through the ideas. */
async function suggestion(name: string) {
  await screen.findByRole('radiogroup', { name: 'Meal' })
  await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0))
  for (let i = 0; i < 4; i++) {
    const found = card(name)
    if (found) return found
    const more = screen.queryByRole('button', { name: /More ideas|Back to the best ideas/ })
    if (!more) break
    fireEvent.click(more)
  }
  throw new Error(`No suggestion for ${name}`)
}

describe('cooking with what’s made ahead', () => {
  test('dosa takes one meal of batter, and no rice again', async () => {
    const h = household()
    renderApp({ path: '/plan', household: h, now: NOW })
    const card = await suggestion(DOSA)
    expect(within(card).getByText(`${BATTER} is ready`, { exact: false })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Cook this' }))
    const sheet = screen.getByRole('dialog', { name: `Cook ${DOSA}` })
    const made = within(sheet).getByRole('list', { name: 'Made ahead' })
    expect(within(made).getByText('4 meals ready')).toBeTruthy()
    expect(within(made).getByText('1 meal')).toBeTruthy()
    expect(within(sheet).queryByText('இட்லி அரிசி')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cooked · take from stock' }))
    await waitFor(() => expect(used(h, 'b-batter').map((e) => e.quantity)).toEqual([1]))
    expect(stock(h, 'idli_arisi')).toBe(2000)
    // The strip counts it.
    expect(await screen.findByText('3 meals left · keeps till Thu 7 am')).toBeTruthy()
  })

  test('undo gives the meal of batter back', async () => {
    const h = household()
    renderApp({ path: '/plan', household: h, now: NOW })
    fireEvent.click(within(await suggestion(DOSA)).getByRole('button', { name: 'Cook this' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cooked · take from stock' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(h.server.batchEvents().filter((e) => e.kind === 'undo')).toHaveLength(1))
    expect(await screen.findByText('4 meals left · keeps till Thu 7 am')).toBeTruthy()
  })

  test('a meal of ragi koozh is five glasses of its batch', async () => {
    const h = household({ batter: false, ragi: true })
    renderApp({ path: '/plan', household: h, now: NOW })
    const card = await suggestion(RAGI)
    fireEvent.click(within(card).getByRole('button', { name: 'Cook this' }))
    const sheet = screen.getByRole('dialog', { name: `Cook ${RAGI}` })
    expect(within(within(sheet).getByRole('list', { name: 'Made ahead' })).getByText('5 glasses')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cooked · take from stock' }))
    await waitFor(() => expect(used(h, 'b-ragi').map((e) => e.quantity)).toEqual([5]))
    expect(await screen.findByText('5 glasses left · keeps till Thu 7 am')).toBeTruthy()
  })
})

describe('suggestions know what’s ready', () => {
  test('no batter: dosa needs it, and cooking it takes none', async () => {
    const h = household({ batter: false })
    renderApp({ path: '/plan', household: h, now: NOW })
    const card = await suggestion(DOSA)
    expect(within(card).getByText(`Needs ${BATTER}`)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Cook this' }))
    const made = within(screen.getByRole('dialog', { name: `Cook ${DOSA}` })).getByRole('list', { name: 'Made ahead' })
    expect(within(made).getByText('None ready: start a batch from Plan')).toBeTruthy()
    expect(within(made).getByRole('checkbox', { name: `Use ${BATTER}` })).toHaveProperty('disabled', true)
  })

  test('batter ready lifts dosa above a dish that needs nothing made ahead', async () => {
    renderApp({ path: '/plan', household: household(), now: NOW })
    await suggestion(DOSA)
    const names = screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))
    expect(names.indexOf(DOSA)).toBeLessThan(names.indexOf('வெண் பொங்கல்'))
  })
})

describe('the dish sheet', () => {
  const open = async (name: string, en: string, h = household({ batter: false })) => {
    renderApp({ path: '/dishes', household: h, now: NOW })
    await screen.findByRole('button', { name: '+ Add dish' })
    // The row reads "தோசைDosaVeg"; the batter's name has தோசை in it too.
    const row = await waitFor(() => {
      const found = screen.getAllByRole('button').find((b) => b.textContent?.startsWith(`${name}${en}`))
      if (!found) throw new Error(`No dish row for ${en}`)
      return found
    })
    fireEvent.click(row)
    return { h, sheet: screen.getByRole('dialog', { name }) }
  }

  test('batter: how it’s made, what a batch makes, and keep it going', async () => {
    const { h, sheet } = await open(BATTER, 'Idli/dosa batter')
    const section = within(sheet).getByRole('region', { name: 'Made ahead' })
    expect(within(section).getByText('Soak 5 h · grind · ferment 10 h (adjustable)')).toBeTruthy()
    expect(within(section).getByText('One batch makes 4 meals · keeps 3 days')).toBeTruthy()
    expect(await within(section).findByText('இட்லி அரிசி')).toBeTruthy()
    expect(within(sheet).queryByText('Ingredients for 5')).toBeNull()
    const keep = within(section).getByRole('switch')
    expect(keep).toHaveProperty('checked', true)
    fireEvent.click(keep)
    await waitFor(() => expect((h.server.dishes().find((d) => d.catalog_key === 'idli_dosa_batter')!.prep_plan as { keep_going: boolean }).keep_going).toBe(false))
    // The rest of the plan is kept.
    expect((h.server.dishes().find((d) => d.catalog_key === 'idli_dosa_batter')!.prep_plan as { yield: number }).yield).toBe(4)
  })

  test('dosa says what it’s made with, and opens it', async () => {
    const { sheet } = await open(DOSA, 'Dosa')
    const made = within(sheet).getByRole('list', { name: 'Made with' })
    fireEvent.click(within(made).getByRole('button', { name: `1 meal of ${BATTER} ›` }))
    expect(within(sheet).getByRole('region', { name: 'Made ahead' })).toBeTruthy()
  })

  test('ragi koozh: buttermilk when serving, five glasses a meal', async () => {
    const { sheet } = await open(RAGI, 'Ragi koozh')
    expect(within(sheet).getByText('Added when serving, for 5')).toBeTruthy()
    expect(within(sheet).getByText('5 glasses of a batch for each meal')).toBeTruthy()
  })
})
