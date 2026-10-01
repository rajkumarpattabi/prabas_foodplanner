import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { calendarMonths, toCheckCount } from '../calendar/view.ts'
import type { CalendarDay } from '../calendar/types.ts'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { renderApp } from '../test/renderApp.tsx'

const NOW = new Date(2026, 9, 1, 12) // Thursday 1 Oct 2026, in Puratasi

function household() {
  const h = fakeHouseholdApi({ withHousehold: true })
  h.server.addCalendarDays(
    { date: '2026-05-16', type: 'kiruthigai' }, // already past
    { date: '2026-09-18', end_date: '2026-10-17', type: 'puratasi', note: 'Sources: goldenchennai, prokerala.' },
    { date: '2026-11-08', type: 'amavasai', note: 'Sources: drikpanchang, tamildailycalendar. Goldenchennai says 9 Nov.' },
    { date: '2026-11-09', type: 'amavasai', note: 'Sources: goldenchennai.' },
    { date: '2027-02-14', type: 'family_custom', label: "Paati's day", verified: true },
  )
  return h
}

const open = (h = household()) => {
  renderApp({ now: NOW, path: '/calendar', household: h })
  return h
}
const month = (title: string) => screen.getByRole('list', { name: title })
const serverDay = (h: ReturnType<typeof household>, date: string) => h.server.calendar().find((d) => d.date === date)

describe('what the calendar lists', () => {
  const d = (date: string, extra: Partial<CalendarDay> = {}) => ({ id: date, date, end_date: null, type: 'amavasai', verified: false, ...extra }) as CalendarDay
  test('from this month to the end of next year, by month; a stretch that began earlier still shows', () => {
    const days = [d('2026-05-16'), d('2026-09-18', { type: 'puratasi', end_date: '2026-10-17' }), d('2026-11-08'), d('2028-01-01')]
    expect(calendarMonths(days, '2026-10-01', '2027-12-31').map((m) => [m.title, m.days.map((x) => x.date)])).toEqual([
      ['September 2026', ['2026-09-18']],
      ['November 2026', ['2026-11-08']],
    ])
    // Everything still to check from today on, however far ahead.
    expect(toCheckCount(days, '2026-10-01')).toBe(3)
    expect(calendarMonths([d('2026-11-08', { verified: true })], '2026-10-01', '2027-12-31', { toCheckOnly: true })).toEqual([])
  })
})

describe('Calendar screen', () => {
  test('shows what is left to check, with sources; past days are not listed', async () => {
    open()
    expect(await screen.findByRole('radio', { name: 'To check (3)' })).toBeTruthy()
    expect(within(month('September 2026')).getByText('Fri 18 Sep – Sat 17 Oct')).toBeTruthy()
    expect(within(month('November 2026')).getByText('Sources: goldenchennai.')).toBeTruthy()
    expect(within(month('February 2027')).getByText("Paati's day")).toBeTruthy()
    expect(within(month('February 2027')).getByText('Confirmed')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'May 2026' })).toBeNull()
  })

  test('confirm one of two disputed days, remove the other; both with undo', async () => {
    const h = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Amavasai on Sun 8 Nov' }))
    expect(await screen.findByText('Amavasai on Sun 8 Nov confirmed')).toBeTruthy()
    await waitFor(() => expect(serverDay(h, '2026-11-08')?.verified).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Remove Amavasai on Mon 9 Nov' }))
    expect(await screen.findByText('Amavasai on Mon 9 Nov removed')).toBeTruthy()
    await waitFor(() => expect(serverDay(h, '2026-11-09')).toBeUndefined())
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(serverDay(h, '2026-11-09')).toMatchObject({ verified: false, note: 'Sources: goldenchennai.' }))
  })

  test('fix Puratasi’s last day: saved, and marked confirmed', async () => {
    const h = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Puratasi on Fri 18 Sep' }))
    const sheet = screen.getByRole('dialog', { name: 'Edit Puratasi' })
    fireEvent.change(within(sheet).getByLabelText('Last day'), { target: { value: '2026-09-01' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('The last day can’t be before the first.')
    fireEvent.change(within(sheet).getByLabelText('Last day'), { target: { value: '2026-10-16' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(serverDay(h, '2026-09-18')).toMatchObject({ end_date: '2026-10-16', verified: true }))
  })

  test('add a family day: it needs a name, then it is saved confirmed', async () => {
    const h = open()
    fireEvent.click(await screen.findByRole('button', { name: '+ Add family day' }))
    const sheet = screen.getByRole('dialog', { name: 'Add a veg-only day' })
    fireEvent.change(within(sheet).getByLabelText('Date'), { target: { value: '2026-12-02' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add day' }))
    expect(within(sheet).getByRole('alert').textContent).toBe('Give it a name, like Thatha’s day.')
    fireEvent.change(within(sheet).getByLabelText('Name'), { target: { value: "Thatha's day" } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add day' }))
    await waitFor(() => expect(serverDay(h, '2026-12-02')).toMatchObject({ type: 'family_custom', label: "Thatha's day", verified: true }))
    expect(within(await screen.findByRole('list', { name: 'December 2026' })).getByText("Thatha's day")).toBeTruthy()
  })

  test('to check only', async () => {
    open()
    fireEvent.click(await screen.findByRole('radio', { name: 'To check (3)' }))
    expect(screen.queryByRole('list', { name: 'February 2027' })).toBeNull()
    expect(screen.getByRole('list', { name: 'November 2026' })).toBeTruthy()
  })
})

describe('getting to the calendar', () => {
  test('from Settings, which says how many dates need checking', async () => {
    renderApp({ now: NOW, path: '/settings', household: household() })
    fireEvent.click(await screen.findByRole('link', { name: /Calendar\s*3 dates to check/ }))
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeTruthy()
  })

  test('from the Plan chip', async () => {
    renderApp({ now: NOW, path: '/plan', household: household() })
    fireEvent.click(await screen.findByRole('link', { name: 'Puratasi (check date) · veg only' }))
    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeTruthy()
  })
})
