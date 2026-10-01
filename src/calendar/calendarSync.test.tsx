import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { ToastProvider } from '../components/ToastProvider.tsx'
import { createSync, type Sync } from '../offline/setup.ts'
import { SyncProvider } from '../offline/SyncProvider.tsx'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { useCalendar, type CalendarState } from './calendarContext.ts'
import { CalendarProvider } from './CalendarProvider.tsx'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

afterEach(() => setOnline(true))

let dbCount = 0

function seeded() {
  const household = fakeHouseholdApi({ withHousehold: true })
  household.server.addCalendarDays(
    { date: '2026-11-08', type: 'amavasai', note: 'Sources: drikpanchang, tamildailycalendar.' },
    { date: '2026-11-09', type: 'amavasai', note: 'Sources: goldenchennai.' },
    { date: '2026-09-18', end_date: '2026-10-17', type: 'puratasi' },
  )
  return household
}

function renderCalendar({ household = seeded(), sync = createSync(household.execute, `prabas-cal-test-${++dbCount}`) }: { household?: ReturnType<typeof fakeHouseholdApi>; sync?: Sync } = {}) {
  const current: { state: CalendarState | null } = { state: null }
  function Probe() {
    const state = useCalendar()
    useEffect(() => {
      current.state = state
    })
    return null
  }
  const result = render(
    <ToastProvider>
      <SyncProvider sync={sync} userId="user-1">
        <CalendarProvider api={household.calendarApi} householdId="hh-1" userId="user-1">
          <Probe />
        </CalendarProvider>
      </SyncProvider>
    </ToastProvider>,
  )
  const cal = () => current.state!
  const day = (date: string) => cal().days.find((d) => d.date === date)
  const ready = () => waitFor(() => expect(cal().status).toBe('ready'))
  return { ...result, household, sync, cal, day, ready }
}

describe('the calendar on this phone', () => {
  test('loads the seeded days, unverified', async () => {
    const { cal, day, ready } = renderCalendar()
    await ready()
    expect(cal().days).toHaveLength(3)
    expect(day('2026-09-18')).toMatchObject({ type: 'puratasi', end_date: '2026-10-17', verified: false })
  })

  test('confirm one, remove the other, and both are saved', async () => {
    const { cal, day, household, ready } = renderCalendar()
    await ready()
    act(() => {
      cal().updateDay(day('2026-11-08')!.id, { verified: true })
      cal().removeDay(day('2026-11-09')!.id)
    })
    await waitFor(() => expect(day('2026-11-09')).toBeUndefined())
    await waitFor(() => expect(household.server.calendar().find((d) => d.date === '2026-11-08')).toMatchObject({ verified: true, updated_by: 'user-1' }))
    expect(household.server.calendar().some((d) => d.date === '2026-11-09')).toBe(false)
  })

  test('a family day added here starts confirmed, as its maker', async () => {
    const { cal, household, ready } = renderCalendar()
    await ready()
    act(() => void cal().addDay({ date: '2026-12-02', type: 'family_custom', label: "  Thatha's day " }))
    await waitFor(() =>
      expect(household.server.calendar().find((d) => d.date === '2026-12-02')).toMatchObject({
        type: 'family_custom',
        label: "Thatha's day",
        verified: true,
        created_by: 'user-1',
      }),
    )
  })

  test('a change made offline survives reopening, and is sent when back online', async () => {
    const household = seeded()
    const first = renderCalendar({ household })
    await first.ready()
    household.setOffline(true)
    setOnline(false)
    act(() => first.cal().updateDay(first.day('2026-11-08')!.id, { verified: true, date: '2026-11-07' }))
    await waitFor(() => expect(first.day('2026-11-07')).toBeTruthy())
    first.unmount()

    const second = renderCalendar({ household, sync: first.sync })
    await second.ready()
    expect(second.day('2026-11-07')?.verified).toBe(true)
    household.setOffline(false)
    setOnline(true)
    await waitFor(() => expect(household.server.calendar().some((d) => d.date === '2026-11-07' && d.verified)).toBe(true))
  })

  test("the other phone's confirmation shows up live", async () => {
    const { day, household, ready } = renderCalendar()
    await ready()
    act(() => household.server.otherPhoneEditsCalendarDay(household.server.calendar()[0].id, { verified: true }))
    await waitFor(() => expect(day('2026-11-08')?.verified).toBe(true))
  })
})
