// send-reminders: called every 15 minutes by the job in migration 0015 (with the
// x-cron-secret header), and by "Send a test" in Settings (with the person's sign-in).
// The phones decide what's coming up and write it to public.reminders; this sends what
// is due to each person's devices, once, and remembers that it did.
//
// Deployed from the Supabase dashboard (Edge Functions > send-reminders), with this file
// and rules.ts, and "Verify JWT" off: it checks every caller itself (the job's secret,
// or a real sign-in for a test). Secrets (Edge Functions > Secrets): VAPID_KEYS (the JSON from
// `npm run vapid-keys`), VAPID_CONTACT (mailto:you@example.com), CRON_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@^0.5.0'
import { planSends, type Device, type PersonSettings, type ReminderRow } from './rules.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Reminders past their time are kept a day, then tidied away. */
const KEEP_EXPIRED_MS = 24 * 3_600_000

let server: webpush.ApplicationServer | null = null
async function appServer(): Promise<webpush.ApplicationServer> {
  if (!server) {
    const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('VAPID_KEYS') ?? ''), { extractable: false })
    server = await webpush.ApplicationServer.new({ contactInformation: Deno.env.get('VAPID_CONTACT') ?? 'mailto:admin@example.com', vapidKeys })
  }
  return server
}

type Admin = ReturnType<typeof createClient>

/** Send one message to one device. 'gone' means the phone has dropped it. */
async function push(device: Device, message: { title: string; body: string; url: string; tag: string }): Promise<'ok' | 'gone' | 'failed'> {
  try {
    const subscriber = (await appServer()).subscribe({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } })
    // A day to arrive (phones that are off get it when they come back); urgent enough to wake the phone.
    await subscriber.pushTextMessage(JSON.stringify(message), { ttl: 86_400, urgency: webpush.Urgency.High })
    return 'ok'
  } catch (e) {
    const status = (e as { response?: Response }).response?.status
    if (status === 404 || status === 410) return 'gone'
    console.error('push failed', device.id, status ?? String(e))
    return 'failed'
  }
}

async function forget(admin: Admin, gone: string[]) {
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone)
}

/** "Send a test": to the signed-in person's own devices. */
async function sendTest(admin: Admin, jwt: string) {
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return json({ error: 'Not signed in' }, 401)
  const { data: devices } = await admin.from('push_subscriptions').select('*').eq('user_id', data.user.id)
  const gone: string[] = []
  let sent = 0
  for (const d of (devices ?? []) as Device[]) {
    const result = await push(d, { title: 'PRABAS test', body: 'Reminders work on this phone.', url: '/plan', tag: 'prabas-test' })
    if (result === 'ok') sent++
    if (result === 'gone') gone.push(d.id)
  }
  await forget(admin, gone)
  return json({ sent })
}

/** The 15-minute run: everything due, for everyone. */
async function run(admin: Admin) {
  const now = new Date()
  await admin.from('reminders').delete().lt('expires_at', new Date(now.getTime() - KEEP_EXPIRED_MS).toISOString())

  const { data: reminders, error } = await admin.from('reminders').select('*').gt('expires_at', now.toISOString())
  if (error) return json({ error: error.message }, 500)
  const rows = (reminders ?? []) as ReminderRow[]
  if (!rows.length) return json({ sent: 0, checked: 0 })

  const households = [...new Set(rows.map((r) => r.household_id))]
  const { data: members } = await admin.from('household_members').select('household_id, user_id').in('household_id', households)
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))]
  const [{ data: settings }, { data: devices }, { data: delivered }] = await Promise.all([
    admin.from('reminder_settings').select('*').in('user_id', userIds),
    admin.from('push_subscriptions').select('*').in('user_id', userIds),
    admin.from('reminder_deliveries').select('reminder_id, user_id').in('reminder_id', rows.map((r) => r.id)),
  ])

  const sends = planSends({
    reminders: rows,
    members: (members ?? []) as { household_id: string; user_id: string }[],
    settings: new Map(((settings ?? []) as (PersonSettings & { user_id: string })[]).map((s) => [s.user_id, s])),
    devices: (devices ?? []) as Device[],
    delivered: new Set((delivered ?? []).map((d) => `${d.reminder_id}|${d.user_id}`)),
    now,
  })

  const gone = new Set<string>()
  const used = new Set<string>()
  let sent = 0
  for (const s of sends) {
    const results = await Promise.all(
      s.devices.map(async (d) => {
        const result = await push(d, { title: s.reminder.title, body: s.reminder.body, url: s.reminder.url, tag: s.reminder.id })
        if (result === 'gone') gone.add(d.id)
        if (result === 'ok') used.add(d.id)
        return result
      }),
    )
    // Recorded once it reached a device, or once none of theirs is left: never twice.
    if (results.includes('ok') || results.every((r) => r === 'gone')) {
      await admin.from('reminder_deliveries').upsert({ reminder_id: s.reminder.id, user_id: s.user_id }, { onConflict: 'reminder_id,user_id', ignoreDuplicates: true })
      if (results.includes('ok')) sent++
    }
  }
  await forget(admin, [...gone])
  if (used.size) await admin.from('push_subscriptions').update({ last_used_at: now.toISOString() }).in('id', [...used])
  return json({ sent, checked: rows.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const secret = Deno.env.get('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') === secret) return run(admin)

  const body = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (body?.test && jwt) return sendTest(admin, jwt)
  return json({ error: 'Not allowed' }, 401)
})
