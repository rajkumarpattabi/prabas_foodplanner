import { vi } from 'vitest'
import type { DeviceKeys, PushDeps, PushSupport } from '../reminders/push.ts'

/** This phone's push manager and the Supabase calls, in memory. */
export function fakePush({ support = 'ok' as PushSupport, allow = true } = {}) {
  const state = { subscribed: null as DeviceKeys | null, registered: new Map<string, { keys: DeviceKeys; label: string }>(), tests: 0, permission: 'default' as NotificationPermission }
  const keys: DeviceKeys = { endpoint: 'https://push.example.test/this-phone', p256dh: 'p256dh-test-key', auth: 'auth-test-key' }
  const deps: PushDeps = {
    support: () => support,
    permission: () => state.permission,
    current: vi.fn(async () => state.subscribed),
    subscribe: vi.fn(async () => {
      state.permission = allow ? 'granted' : 'denied'
      if (!allow) throw new Error('Notifications were not allowed.')
      state.subscribed = keys
      return keys
    }),
    unsubscribe: vi.fn(async () => {
      const was = state.subscribed?.endpoint ?? null
      state.subscribed = null
      return was
    }),
    register: vi.fn(async (k: DeviceKeys, label: string) => void state.registered.set(k.endpoint, { keys: k, label })),
    forget: vi.fn(async (endpoint: string) => void state.registered.delete(endpoint)),
    sendTest: vi.fn(async () => {
      state.tests++
      return state.registered.size
    }),
    label: () => 'iPhone',
  }
  return { deps, state }
}
