// Turning reminders on and off for this phone: the browser's push subscription, and
// telling Supabase which device it is. Behind an interface so tests use a fake.

import { createContext, useContext } from 'react'
import type { Supabase } from '../lib/supabase.ts'

export interface DeviceKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * ok: can be turned on. install-first: an iPhone or iPad not opened from the Home
 * Screen. unsupported: this browser can't. not-set-up: this build has no push key.
 */
export type PushSupport = 'ok' | 'install-first' | 'unsupported' | 'not-set-up'

export interface PushDeps {
  support(): PushSupport
  permission(): NotificationPermission
  /** This phone's subscription, if it has one. */
  current(): Promise<DeviceKeys | null>
  /** Asks permission if needed, then subscribes. Throws if refused. */
  subscribe(): Promise<DeviceKeys>
  /** Returns the endpoint it had, if any. */
  unsubscribe(): Promise<string | null>
  register(keys: DeviceKeys, label: string): Promise<void>
  forget(endpoint: string): Promise<void>
  /** Sends a test reminder to this person's devices; how many it went to. */
  sendTest(): Promise<number>
  /** "iPhone", "Android phone". */
  label(): string
}

export const PushDepsContext = createContext<PushDeps | null>(null)
export const usePushDeps = () => useContext(PushDepsContext)

/** The VAPID public key (base64url) as the bytes pushManager.subscribe wants. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const b64url = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''

const toKeys = (s: PushSubscription): DeviceKeys => ({ endpoint: s.endpoint, p256dh: b64url(s.getKey('p256dh')), auth: b64url(s.getKey('auth')) })

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** The real thing: this browser's push manager, and Supabase. */
export function browserPush(sb: Supabase, publicKey: string | null): PushDeps {
  const registration = () => navigator.serviceWorker.ready
  return {
    support() {
      if (!publicKey) return 'not-set-up'
      if (isIos() && !isStandalone()) return 'install-first'
      return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'ok' : 'unsupported'
    },
    permission: () => ('Notification' in window ? Notification.permission : 'denied'),
    async current() {
      const sub = await (await registration()).pushManager.getSubscription()
      return sub ? toKeys(sub) : null
    },
    async subscribe() {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed.')
      const reg = await registration()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }))
      return toKeys(sub)
    },
    async unsubscribe() {
      const sub = await (await registration()).pushManager.getSubscription()
      if (!sub) return null
      await sub.unsubscribe()
      return sub.endpoint
    },
    async register(keys, label) {
      const { error } = await sb.rpc('register_push', { p_endpoint: keys.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_label: label })
      if (error) throw new Error(error.message)
    },
    async forget(endpoint) {
      const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) throw new Error(error.message)
    },
    async sendTest() {
      const { data, error } = await sb.functions.invoke('send-reminders', { body: { test: true } })
      if (error) throw new Error(error.message)
      return Number((data as { sent?: number } | null)?.sent ?? 0)
    },
    label: () => (isIos() ? (navigator.userAgent.includes('iPad') ? 'iPad' : 'iPhone') : /Android/.test(navigator.userAgent) ? 'Android phone' : 'This browser'),
  }
}
