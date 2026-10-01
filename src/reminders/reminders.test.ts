import { describe, expect, test } from 'vitest'
import type { Dish } from '../dishes/types.ts'
import type { Combo } from '../plan/combos.ts'
import { batchState } from '../prepared/batchState.ts'
import type { Batch, BatchEvent, PrepStage } from '../prepared/types.ts'
import type { Item } from '../stock/types.ts'
import { decide, inQuietHours, localParts, planSends, type PersonSettings, type ReminderRow } from '../../supabase/functions/send-reminders/rules.ts'
import { keyBytes } from './push.ts'
import { reminderChanges, upcomingReminders, type ScheduleInput } from './schedule.ts'
import type { Reminder } from './types.ts'

// Monday 5 Oct 2026, 6 pm (tests run in Asia/Kolkata).
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute)
const NOW = at(5, 18)

const RAGI: PrepStage[] = [
  { key: 'soak', hours: 9, action: true, takes_ingredients: true },
  { key: 'cook', hours: 1, action: true },
  { key: 'ferment', hours: 24, action: false, adjustable: true },
]
const BATTER: PrepStage[] = [
  { key: 'soak', hours: 5, action: true, takes_ingredients: true },
  { key: 'grind', hours: 0, action: true },
  { key: 'ferment', hours: 10, action: false, adjustable: true },
]
const batch = (id: string, name_en: string, stages: PrepStage[], start: Date, extra: Partial<Batch> = {}): Batch => ({
  id,
  household_id: 'hh',
  dish_id: `dish-${id}`,
  name_ta: `${name_en}-ta`,
  name_en,
  stages,
  planned_start: start.toISOString(),
  ready_by: null,
  yield: 10,
  unit: 'glasses',
  keeps_days: 3,
  created_by: 'u1',
  created_at: start.toISOString(),
  ...extra,
})
let n = 0
const done = (batch_id: string, stage: number, when: Date): BatchEvent => ({
  id: `e${++n}`,
  household_id: 'hh',
  batch_id,
  kind: 'done',
  stage,
  quantity: null,
  undoes: null,
  occurred_at: when.toISOString(),
  created_by: 'u1',
  created_at: when.toISOString(),
})

const dish = (id: string, name_en: string, extra: Partial<Dish> = {}): Dish => ({
  id,
  household_id: 'hh',
  catalog_key: id,
  name_ta: `${name_en}-ta`,
  name_en,
  aliases: [],
  type: 'tiffin',
  meals: ['breakfast'],
  is_veg: true,
  tags: [],
  ingredients: [],
  side_ids: [],
  prep_plan: null,
  uses_prepared: [],
  is_favourite: false,
  is_kids_favourite: false,
  dont_suggest: false,
  notes: null,
  created_by: null,
  created_at: '',
  updated_by: null,
  updated_at: '',
  ...extra,
})
const batterDish = dish('batter', 'Idli/dosa batter', {
  type: 'prepared',
  prep_plan: { stages: BATTER, yield: 4, unit: 'meals', keeps_days: 3, ingredients: [], keep_going: true },
})
const dosa = dish('dosa', 'Dosa', { uses_prepared: [{ dish_id: 'batter', quantity: 1 }] })
const chicken = dish('chicken', 'Chicken kuzhambu', { type: 'nonveg_gravy', is_veg: false, meals: ['lunch'] })
const combo = (main: Dish): Combo => ({ main, base: null, sides: [], leftover: null })
const item = (name_en: string) => ({ id: name_en, name_ta: `${name_en}-ta`, name_en }) as Item

function input(extra: Partial<ScheduleInput> = {}, now = NOW): ScheduleInput {
  return {
    now,
    states: [],
    tomorrowMeals: [],
    preparedCovered: new Set(),
    dishesById: new Map([batterDish, dosa, chicken].map((d) => [d.id, d])),
    nudges: [],
    lowItems: [],
    name: (x) => x.name_en,
    ...extra,
  }
}
const ragiPlanned = (now = NOW) => batchState(batch('b1', 'Ragi koozh', RAGI, at(5, 21)), [], now)

describe('batch steps', () => {
  test('a soak due at 9 pm tonight: at 9 pm, the evening before, and when it is ready', () => {
    expect(upcomingReminders(input({ states: [ragiPlanned()] }))).toEqual([
      {
        key: 'stage:b1:0',
        type: 'stage',
        title: 'Ragi koozh: soak now',
        body: 'Ready Wed 7 am',
        url: '/plan',
        due_at: at(5, 21).toISOString(),
        due_date: null,
        at_evening: false,
        expires_at: at(6, 0).toISOString(),
      },
      {
        key: 'tonight:b1:0',
        type: 'prep',
        title: 'Tonight: soak Ragi koozh at 9 pm',
        body: 'Ready Wed 7 am',
        url: '/plan',
        due_at: null,
        due_date: '2026-10-05',
        at_evening: true,
        expires_at: at(6, 0).toISOString(),
      },
      {
        key: 'ready:b1',
        type: 'stage',
        title: 'Ragi koozh is ready',
        body: '10 glasses · keeps till Sat 7 am',
        url: '/plan',
        due_at: at(7, 7).toISOString(),
        due_date: null,
        at_evening: false,
        expires_at: at(7, 19).toISOString(),
      },
    ])
  })

  test('the same from either phone, and a few minutes later', () => {
    const one = upcomingReminders(input({ states: [ragiPlanned()] }))
    const later = at(5, 18, 10)
    expect(upcomingReminders(input({ states: [ragiPlanned(later)] }, later))).toEqual(one)
  })

  test('a step not done on time: the same reminder whatever the minute, saying when it was due', () => {
    const late = (t: Date) => upcomingReminders(input({ states: [ragiPlanned(t)] }, t))
    expect(late(at(5, 21, 30))).toEqual(late(at(5, 21, 45)))
    expect(late(at(5, 21, 30))).toMatchObject([{ key: 'stage:b1:0', body: 'It was due Mon 9 pm' }])
  })

  test('soaked: the next step is cooking in the morning', () => {
    const s = batchState(batch('b1', 'Ragi koozh', RAGI, at(5, 21)), [done('b1', 0, at(5, 21))], at(5, 22))
    const r = upcomingReminders(input({ states: [s] }, at(5, 22)))
    expect(r.map((x) => [x.key, x.title])).toEqual([
      ['stage:b1:1', 'Ragi koozh: cook now'],
      ['tonight:b1:1', 'Tomorrow morning: cook Ragi koozh at 6 am'],
      ['ready:b1', 'Ragi koozh is ready'],
    ])
  })

  test('a step in the afternoon gets no evening reminder; one that has passed none either', () => {
    const afternoon = batchState(batch('b2', 'Idli/dosa batter', BATTER, at(6, 15)), [], NOW)
    expect(upcomingReminders(input({ states: [afternoon] })).map((x) => x.key)).toEqual(['stage:b2:0', 'ready:b2'])
  })

  test('nearly finished: the evening before its last day', () => {
    const ready = batchState(batch('b3', 'Idli/dosa batter', BATTER, at(2, 16), { yield: 4, unit: 'meals' }), [done('b3', 0, at(2, 16)), done('b3', 1, at(2, 21))], NOW)
    expect(upcomingReminders(input({ states: [ready] }))).toMatchObject([
      { key: 'expiry:b3', type: 'expiry', title: 'Idli/dosa batter: use it by tomorrow', body: '4 meals left', url: '/stock', due_date: '2026-10-05' },
    ])
  })
})

describe('night-before prep', () => {
  test('dosa tomorrow with no batter: soak and grind tonight; with a batch on the go, nothing', () => {
    const meals = [{ date: '2026-10-06', meal: 'breakfast' as const, combo: combo(dosa) }]
    expect(upcomingReminders(input({ tomorrowMeals: meals }))).toMatchObject([
      { key: 'prep:2026-10-06:breakfast:batter', type: 'prep', title: "Dosa for tomorrow's breakfast", body: 'Needs Idli/dosa batter: soak and grind tonight.', at_evening: true },
    ])
    expect(upcomingReminders(input({ tomorrowMeals: meals, preparedCovered: new Set(['batter']) }))).toEqual([])
  })

  test('non-veg tomorrow: take it out to defrost', () => {
    const meals = [{ date: '2026-10-06', meal: 'lunch' as const, combo: combo(chicken) }]
    expect(upcomingReminders(input({ tomorrowMeals: meals }))).toMatchObject([
      { key: 'defrost:2026-10-06:lunch', title: "Chicken kuzhambu for tomorrow's lunch", body: "Take the meat or fish out to defrost, if it's frozen." },
    ])
  })
})

describe('shopping', () => {
  test('tomorrow is a non-veg day: fish or meat (today’s is too late)', () => {
    const items = [item('Fish'), item('Chicken')]
    const r = upcomingReminders(input({ nudges: [{ date: '2026-10-06', day: 'Tomorrow', items }, { date: '2026-10-05', day: 'Today', items }] }))
    expect(r).toMatchObject([{ key: 'nonveg:2026-10-06', type: 'nonveg', title: 'Tomorrow is a non-veg day', body: 'Fish or meat? Fish and Chicken.', url: '/shop' }])
  })
  test('running low: once a day, up to four named', () => {
    const r = upcomingReminders(input({ lowItems: ['Rice', 'Toor dal', 'Oil', 'Salt', 'Tea'].map(item) }))
    expect(r).toMatchObject([{ key: 'low:2026-10-05', type: 'low', body: 'Rice, Toor dal, Oil, Salt and 1 more' }])
  })
})

describe('keeping the table in step', () => {
  const row = (key: string, title: string): Reminder =>
    ({ ...upcomingReminders(input({ lowItems: [item('Rice')] }))[0], key, id: `hh:${key}`, household_id: 'hh', title }) as Reminder
  test('new and changed ones are written; ones that no longer apply are removed; the rest left alone', () => {
    const drafts = upcomingReminders(input({ lowItems: [item('Rice')], states: [ragiPlanned()] }))
    const existing = [row('low:2026-10-05', 'Running low'), row('stage:b1:0', 'Old title'), row('gone', 'x')]
    const { upserts, deletes } = reminderChanges(existing, drafts, 'hh')
    expect(upserts.map((u) => u.id).sort()).toEqual(['hh:ready:b1', 'hh:stage:b1:0', 'hh:tonight:b1:0'])
    expect(deletes).toEqual(['hh:gone'])
  })
})

describe('who gets what, when (the server’s rules)', () => {
  const me: PersonSettings = { types: ['prep', 'stage', 'nonveg', 'low', 'expiry'], evening_time: '20:30', quiet_from: '22:00', quiet_to: '06:30', timezone: 'Asia/Kolkata' }
  const exact = { type: 'stage', due_at: at(5, 21).toISOString(), due_date: null, at_evening: false, expires_at: at(6, 0).toISOString() }
  const evening = { type: 'prep', due_at: null, due_date: '2026-10-05', at_evening: true, expires_at: at(6, 0).toISOString() }

  test('local time in a time zone', () => {
    expect(localParts(at(5, 21, 15), 'Asia/Kolkata')).toEqual({ date: '2026-10-05', minutes: 21 * 60 + 15 })
    expect(localParts(at(5, 21, 15), 'Europe/London')).toEqual({ date: '2026-10-05', minutes: 16 * 60 + 45 })
  })

  test('an exact time: wait, then send, then too late', () => {
    expect(decide(exact, me, at(5, 20))).toBe('wait')
    expect(decide({ ...exact, due_at: at(5, 21).toISOString() }, { ...me, quiet_from: '23:00' }, at(5, 21, 5))).toBe('send')
    expect(decide(exact, me, at(6, 0))).toBe('drop')
  })

  test('evening ones go at each person’s own evening time', () => {
    expect(decide(evening, me, at(5, 20, 15))).toBe('wait')
    expect(decide(evening, me, at(5, 20, 30))).toBe('send')
    expect(decide(evening, { ...me, evening_time: '19:00' }, at(5, 20, 15))).toBe('send')
  })

  test('quiet hours hold things back until they end; not past their time', () => {
    expect(decide(exact, me, at(5, 22, 30))).toBe('wait')
    const morning = { ...exact, due_at: at(6, 5).toISOString(), expires_at: at(6, 8).toISOString() }
    expect(decide(morning, me, at(6, 6))).toBe('wait')
    expect(decide(morning, me, at(6, 6, 30))).toBe('send')
    expect(inQuietHours(23 * 60, '22:00', '06:30')).toBe(true)
    expect(inQuietHours(12 * 60, '13:00', '15:00')).toBe(false)
    expect(inQuietHours(12 * 60, '22:00', '22:00')).toBe(false)
  })

  test('a type turned off is never sent', () => {
    expect(decide(exact, { ...me, types: ['prep'] }, at(5, 21, 5))).toBe('drop')
  })
})

describe('one run of the sender', () => {
  const r = (id: string, extra: Partial<ReminderRow> = {}): ReminderRow => ({
    id: `hh:${id}`,
    household_id: 'hh',
    type: 'stage',
    title: 'Ragi koozh: soak now',
    body: '',
    url: '/plan',
    due_at: at(5, 21).toISOString(),
    due_date: null,
    at_evening: false,
    expires_at: at(6, 0).toISOString(),
    ...extra,
  })
  const device = (user_id: string, n = 1) => ({ id: `${user_id}-${n}`, user_id, endpoint: `https://push.example.test/${user_id}/${n}`, p256dh: 'p', auth: 'a' })
  const members = [
    { household_id: 'hh', user_id: 'raj' },
    { household_id: 'hh', user_id: 'amma' },
    { household_id: 'other', user_id: 'stranger' },
  ]
  const base = { members, settings: new Map(), delivered: new Set<string>(), now: at(5, 21, 5) }

  test('each person in the household with a device gets it, on every device they have', () => {
    const sends = planSends({ ...base, reminders: [r('stage:b1:0')], devices: [device('raj'), device('raj', 2), device('amma'), device('stranger')] })
    expect(sends.map((s) => [s.user_id, s.devices.map((d) => d.id)])).toEqual([
      ['raj', ['raj-1', 'raj-2']],
      ['amma', ['amma-1']],
    ])
  })

  test('not again once sent; nobody without a device; each person’s own settings', () => {
    const devices = [device('raj'), device('amma')]
    const sends = planSends({
      ...base,
      reminders: [r('stage:b1:0')],
      devices,
      delivered: new Set(['hh:stage:b1:0|raj']),
      settings: new Map([['amma', { types: ['prep'], evening_time: '20:30', quiet_from: '22:00', quiet_to: '06:30', timezone: 'Asia/Kolkata' }]]),
    })
    expect(sends).toEqual([])
    expect(planSends({ ...base, reminders: [r('stage:b1:0')], devices: [] })).toEqual([])
  })
})

describe('the push key', () => {
  test('a VAPID public key (base64url, as npm run vapid-keys prints it) is the 65-byte point the phone wants', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const text = btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect([...keyBytes(text)]).toEqual([...raw])
    expect(raw).toHaveLength(65)
  })
})
