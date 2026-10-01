import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const BATTER = 'இட்லி தோசை மாவு'

/** Batter ready since `readyDay` 7 am (soaked the afternoon before, ground at 9 pm). */
function household(readyDay = 5) {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addPrepared()
  h.server.addBatch(
    {
      id: 'b-batter',
      dish_id: 'hh-1:dish:idli_dosa_batter',
      name_ta: BATTER,
      name_en: 'Idli/dosa batter',
      stages: [
        { key: 'soak', hours: 5, action: true, takes_ingredients: true },
        { key: 'grind', hours: 0, action: true },
        { key: 'ferment', hours: 10, action: false, adjustable: true },
      ],
      planned_start: at(readyDay - 1, 16).toISOString(),
      yield: 4,
      unit: 'meals',
      keeps_days: 3,
    },
    [
      { kind: 'done', stage: 0, occurred_at: at(readyDay - 1, 16).toISOString() },
      { kind: 'done', stage: 1, occurred_at: at(readyDay - 1, 21).toISOString() },
    ],
  )
  return h
}

const row = () => within(screen.getByRole('list', { name: 'Ready to eat' })).getByText(BATTER).closest('li')!

describe('ready batches on the Stock tab', () => {
  test('listed under Ready to eat with what’s left and how long it keeps; used one at a time', async () => {
    const h = household()
    renderApp({ path: '/stock', household: h, now: at(5, 9) })
    await screen.findByRole('list', { name: 'Ready to eat' })
    expect(within(row()).getByText('4 meals left')).toBeTruthy()
    expect(within(row()).getByText('Keeps 3 days')).toBeTruthy()
    fireEvent.click(within(row()).getByRole('button', { name: `Used one, ${BATTER}` }))
    await waitFor(() => expect(within(row()).getByText('3 meals left')).toBeTruthy())
    await waitFor(() => expect(h.server.batchEvents().filter((e) => e.kind === 'used')).toHaveLength(1))
  })

  test('the last day is red; thrown away takes it off, and undo brings it back', async () => {
    renderApp({ path: '/stock', household: household(), now: at(8, 6) })
    await screen.findByRole('list', { name: 'Ready to eat' })
    expect(within(row()).getByText('Use today')).toBeTruthy()
    fireEvent.click(within(row()).getByRole('button', { name: `Thrown away, ${BATTER}` }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Ready to eat' })).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('list', { name: 'Ready to eat' })).toBeTruthy()
  })

  test('past its keeping time: still listed, to check', async () => {
    renderApp({ path: '/stock', household: household(), now: at(8, 9) })
    await screen.findByRole('list', { name: 'Ready to eat' })
    expect(within(row()).getByText('Past its time · check')).toBeTruthy()
  })
})

