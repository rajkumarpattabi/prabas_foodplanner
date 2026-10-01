/// <reference types="node" />
// The service worker test reads public/push-sw.js from disk, so it needs Node types.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { fakeHouseholdApi } from '../test/fakeHousehold.ts'
import { fakePush } from '../test/fakePush.ts'
import { renderApp } from '../test/renderApp.tsx'

function open(push = fakePush()) {
  const household = fakeHouseholdApi({ withHousehold: true })
  renderApp({ path: '/settings', household, push: push.deps })
  return { household, push }
}
const section = () => screen.findByRole('region', { name: 'Reminders' })

describe('Settings → Reminders', () => {
  test('turn on for this phone: asks, registers the phone, and saves the settings the server reads', async () => {
    const { household, push } = open()
    const s = await section()
    expect(await within(s).findByText('Off for this phone')).toBeTruthy()
    fireEvent.click(within(s).getByRole('button', { name: 'Turn on reminders' }))
    expect(await within(s).findByText('On for this phone')).toBeTruthy()
    expect([...push.state.registered.values()]).toMatchObject([{ label: 'iPhone', keys: { endpoint: 'https://push.example.test/this-phone' } }])
    expect(await screen.findByText('Reminders on for this phone')).toBeTruthy()
    await waitFor(() => expect(household.server.reminderSettings()).toMatchObject({ evening_time: '20:30', quiet_from: '22:00' }))
  })

  test('blocked: says where to unblock it', async () => {
    open(fakePush({ allow: false }))
    fireEvent.click(await within(await section()).findByRole('button', { name: 'Turn on reminders' }))
    expect(await screen.findByText('Notifications are blocked for PRABAS in this phone’s settings.')).toBeTruthy()
  })

  test('send a test, then turn off', async () => {
    const push = fakePush()
    push.state.subscribed = { endpoint: 'https://push.example.test/this-phone', p256dh: 'p', auth: 'a' }
    push.state.registered.set('https://push.example.test/this-phone', { keys: push.state.subscribed, label: 'iPhone' })
    open(push)
    const s = await section()
    fireEvent.click(await within(s).findByRole('button', { name: 'Send a test' }))
    expect(await screen.findByText('Test sent. It should arrive in a moment.')).toBeTruthy()
    fireEvent.click(within(s).getByRole('button', { name: 'Turn off for this phone' }))
    expect(await within(s).findByText('Off for this phone')).toBeTruthy()
    expect(push.state.registered.size).toBe(0)
  })

  test('on an iPhone not opened from the Home Screen: how to add it', async () => {
    open(fakePush({ support: 'install-first' }))
    const note = within(await section()).getByRole('note')
    expect(note.textContent).toContain('On iPhone, reminders need PRABAS on your Home Screen')
    expect(note.textContent).toContain('iOS 16.4 or later')
  })

  test('which kinds, the evening time and quiet hours are saved for this person', async () => {
    const { household } = open()
    const s = await section()
    fireEvent.click(within(s).getByRole('switch', { name: 'Staples running low' }))
    fireEvent.change(within(s).getByLabelText('Evening time'), { target: { value: '21:15' } })
    await waitFor(() =>
      expect(household.server.reminderSettings()).toMatchObject({ evening_time: '21:15', types: ['prep', 'stage', 'nonveg', 'expiry'] }),
    )
    expect(within(s).getByRole('switch', { name: 'Staples running low' })).toHaveProperty('checked', false)
  })
})

describe('the service worker', () => {
  function load() {
    const listeners: Record<string, (e: unknown) => void> = {}
    const shown: unknown[] = []
    const opened: string[] = []
    const self = {
      addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn),
      registration: { scope: 'https://raj.example.test/prabas_foodplanner/', showNotification: vi.fn(async (...args: unknown[]) => void shown.push(args)) },
      clients: { matchAll: async () => [], openWindow: async (url: string) => void opened.push(url) },
    }
    new Function('self', readFileSync(resolve(process.cwd(), 'public/push-sw.js'), 'utf8'))(self)
    const run = async (type: string, event: Record<string, unknown>) => {
      let wait: Promise<unknown> = Promise.resolve()
      listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => void (wait = p) })
      await wait
    }
    return { run, shown, opened }
  }

  test('a reminder is shown with its title, text and tab; tapping opens that tab', async () => {
    const { run, shown, opened } = load()
    await run('push', { data: { json: () => ({ title: 'Tonight: soak ragi koozh at 9 pm', body: 'Ready Wed 7 am', url: '/shop', tag: 'hh:tonight:b1:0' }) } })
    expect(shown).toEqual([['Tonight: soak ragi koozh at 9 pm', expect.objectContaining({ body: 'Ready Wed 7 am', tag: 'hh:tonight:b1:0', data: { url: '/shop' } })]])
    await run('notificationclick', { notification: { close: () => {}, data: { url: '/shop' } } })
    expect(opened).toEqual(['https://raj.example.test/prabas_foodplanner/shop'])
  })
})
