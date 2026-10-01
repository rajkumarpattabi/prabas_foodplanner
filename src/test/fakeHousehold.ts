import { vi } from 'vitest'
import { HouseholdError, type Household, type HouseholdApi, type Profile } from '../household/api.ts'
import type { BackupApi } from '../backup/api.ts'
import type { Row } from '../backup/format.ts'
import type { OutboxOp } from '../offline/db.ts'
import type { OpResult } from '../offline/outbox.ts'
import { normaliseJoinCode } from '../household/joinCode.ts'
import { DishError, type DishApi } from '../dishes/api.ts'
import type { Dish } from '../dishes/types.ts'
import type { TableChange } from '../offline/useTableSync.ts'
import { MealError, type MealApi } from '../plan/api.ts'
import { CalendarError, type CalendarApi } from '../calendar/api.ts'
import type { CalendarDay } from '../calendar/types.ts'
import type { Leftover, MealRecord } from '../plan/types.ts'
import { StockError, type RemoteChange, type StockApi } from '../stock/api.ts'
import type { Item, StockEvent } from '../stock/types.ts'

const T0 = '2026-09-29T10:00:00.000Z'

/** A few catalogue items, as a new household gets them. */
function starterItems(householdId: string): Item[] {
  const item = (key: string, name_ta: string, name_en: string, extra: Partial<Item>): Item => ({
    id: `${householdId}:${key}`,
    household_id: householdId,
    name_ta,
    name_en,
    aliases: [],
    category: 'vegetable',
    unit: 'g',
    display_unit: 'g',
    shelf_life_days: 5,
    is_staple: false,
    low_threshold: null,
    piece_weight_g: null,
    has_opened_form: false,
    opened_shelf_life_days: null,
    step: 250,
    archived: false,
    created_by: null,
    created_at: T0,
    updated_by: null,
    updated_at: T0,
    ...extra,
  })
  return [
    item('okra', 'வெண்டைக்காய்', 'Ladies finger', { aliases: ['okra', 'vendakkai', 'bhindi'] }),
    item('coconut', 'தேங்காய்', 'Coconut', {
      category: 'other',
      unit: 'piece',
      display_unit: 'piece',
      step: 1,
      shelf_life_days: 30,
      has_opened_form: true,
      opened_shelf_life_days: 3,
    }),
    item('rice', 'அரிசி', 'Rice', { category: 'grain', display_unit: 'kg', shelf_life_days: null, is_staple: true, step: 1000 }),
    item('egg', 'முட்டை', 'Egg', { category: 'egg', unit: 'piece', display_unit: 'piece', shelf_life_days: 14, step: 1 }),
  ]
}

/** A few catalogue dishes: pongal with its ranked sides, and an egg dish. */
function starterDishes(householdId: string): Dish[] {
  const id = (key: string) => `${householdId}:dish:${key}`
  const dish = (key: string, name_ta: string, name_en: string, extra: Partial<Dish>): Dish => ({
    id: id(key),
    household_id: householdId,
    catalog_key: key,
    name_ta,
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
    created_at: T0,
    updated_by: null,
    updated_at: T0,
    ...extra,
  })
  return [
    dish('ven_pongal', 'வெண் பொங்கல்', 'Ven pongal', {
      aliases: ['pongal'],
      ingredients: [{ item_id: `${householdId}:rice`, quantity: 400 }],
      side_ids: [id('kathirikkai_sambar'), id('thengai_chutney')],
    }),
    dish('kathirikkai_sambar', 'கத்தரிக்காய் சாம்பார்', 'Brinjal sambar', { type: 'sambar', meals: ['breakfast', 'lunch'], tags: ['legume'] }),
    dish('thengai_chutney', 'தேங்காய் சட்னி', 'Coconut chutney', {
      type: 'chutney',
      meals: ['breakfast', 'dinner'],
      ingredients: [{ item_id: `${householdId}:coconut`, quantity: 1 }],
    }),
    dish('muttai_kuzhambu', 'முட்டைக் குழம்பு', 'Egg kuzhambu', {
      type: 'nonveg_gravy',
      meals: ['lunch', 'dinner'],
      is_veg: false,
      tags: ['protein'],
      ingredients: [{ item_id: `${householdId}:egg`, quantity: 8 }],
    }),
  ]
}

function profile(userId: string, displayName: string): Profile {
  return {
    user_id: userId,
    display_name: displayName,
    script_pref: 'ta_first',
    theme_pref: 'auto',
    created_by: userId,
    created_at: T0,
    updated_by: userId,
    updated_at: T0,
  }
}

interface Options {
  /** Start with user-1 already in a household with user-2. */
  withHousehold?: boolean
  /** Server unreachable: loads and writes fail, queued edits wait. */
  offline?: boolean
}

/**
 * An in-memory household backend for tests, acting as user-1. It follows the same
 * rules as the database functions: one household per person, codes must match.
 */
export function fakeHouseholdApi({ withHousehold = false, offline = false }: Options = {}) {
  const net = { offline }
  const offlineError = () => new HouseholdError("You're offline. Try again when you're connected.")
  const me = 'user-1'
  const profiles = new Map<string, Profile>([
    [me, profile(me, 'raj')],
    ['user-2', profile('user-2', 'Amma')],
  ])
  let household: Household | null = null
  const members: { userId: string; role: 'owner' | 'member' }[] = []
  // A household user-1 can join with code JOINME.
  const other = { id: 'hh-other', name: 'Other home', join_code: 'JOINME' }
  let codeCounter = 0
  let items: Item[] = []
  let events: StockEvent[] = []
  const stockListeners = new Set<(change: RemoteChange) => void>()
  const tell = (change: RemoteChange) => stockListeners.forEach((l) => l(structuredClone(change)))
  let dishes: Dish[] = []
  const dishListeners = new Set<(change: TableChange) => void>()
  const tellDish = (change: TableChange) => dishListeners.forEach((l) => l(structuredClone(change)))
  let meals: MealRecord[] = []
  let leftovers: Leftover[] = []
  const mealListeners = new Set<(change: TableChange) => void>()
  const tellMeal = (change: TableChange) => mealListeners.forEach((l) => l(structuredClone(change)))
  let calendar: CalendarDay[] = []
  const calendarListeners = new Set<(change: TableChange) => void>()
  const tellCalendar = (change: TableChange) => calendarListeners.forEach((l) => l(structuredClone(change)))
  const seed = (hid: string) => {
    items = starterItems(hid)
    dishes = starterDishes(hid)
  }

  const makeHousehold = (id: string, name: string, code: string, by: string): Household => ({
    id,
    name,
    join_code: code,
    backup_owner_id: by,
    drive_backup_at: null,
    created_by: by,
    created_at: T0,
    updated_by: by,
    updated_at: T0,
  })

  if (withHousehold) {
    household = makeHousehold('hh-1', 'Prabas home', 'K7M4QP', me)
    members.push({ userId: me, role: 'owner' }, { userId: 'user-2', role: 'member' })
    seed('hh-1')
  }

  const write = async () => {
    if (net.offline) throw offlineError()
  }

  const api = {
    load: vi.fn(async () => {
      if (net.offline) throw offlineError()
      return {
      me: { ...profiles.get(me)! },
      household: household && { ...household },
      members: members.map((m) => ({ ...m, joinedAt: T0, profile: { ...profiles.get(m.userId)! } })),
      }
    }),
    createHousehold: vi.fn(async (name: string) => {
      await write()
      if (household) throw new HouseholdError("You're already in a household.")
      household = makeHousehold('hh-1', name, 'K7M4QP', me)
      members.push({ userId: me, role: 'owner' })
      seed('hh-1')
    }),
    joinHousehold: vi.fn(async (code: string) => {
      await write()
      if (household) throw new HouseholdError("You're already in a household.")
      if (normaliseJoinCode(code) !== other.join_code) {
        throw new HouseholdError("That code didn't match a household. Check it with the person who shared it.")
      }
      household = makeHousehold(other.id, other.name, other.join_code, 'user-2')
      members.push({ userId: 'user-2', role: 'owner' }, { userId: me, role: 'member' })
      seed(other.id)
    }),
    rotateJoinCode: vi.fn(async () => {
      await write()
      const code = `NEWCD${++codeCounter}`.slice(0, 6)
      household = household && { ...household, join_code: code }
      return code
    }),
    subscribe: vi.fn(() => () => {}),
  }

  /** Items and stock events, with the same rules as their RLS policies. */
  const stockApi = {
    load: vi.fn(async (householdId: string) => {
      if (net.offline) throw new StockError('offline')
      if (household?.id !== householdId) return { items: [], events: [] }
      return structuredClone({ items, events })
    }),
    subscribe: vi.fn((_householdId: string, onChange: (change: RemoteChange) => void) => {
      stockListeners.add(onChange)
      return () => void stockListeners.delete(onChange)
    }),
  } satisfies StockApi

  /** Dishes, with the same rules as their RLS policies. */
  const dishApi = {
    load: vi.fn(async (householdId: string) => {
      if (net.offline) throw new DishError('offline')
      return household?.id === householdId ? structuredClone(dishes) : []
    }),
    subscribe: vi.fn((_householdId: string, onChange: (change: TableChange) => void) => {
      dishListeners.add(onChange)
      return () => void dishListeners.delete(onChange)
    }),
  } satisfies DishApi

  /** Deleting a dish, like the database: gone, and out of every other dish's sides (the trigger). */
  const deleteDish = (id: string) => {
    if (!dishes.some((d) => d.id === id)) return
    dishes = dishes.filter((d) => d.id !== id)
    tellDish({ table: 'dishes', deletedId: id })
    for (const d of dishes.filter((x) => x.side_ids.includes(id))) {
      const next = { ...d, side_ids: d.side_ids.filter((s) => s !== id) }
      dishes = dishes.map((x) => (x.id === d.id ? next : x))
      tellDish({ table: 'dishes', row: next })
    }
  }

  /** Meals and leftovers, with the same rules as the database. */
  const mealApi = {
    load: vi.fn(async (householdId: string) => {
      if (net.offline) throw new MealError('offline')
      const mine = <T extends { household_id: string }>(rows: T[]) => structuredClone(rows.filter((r) => r.household_id === householdId))
      return { meals: mine(meals), leftovers: mine(leftovers) }
    }),
    subscribe: vi.fn((_householdId: string, onChange: (change: TableChange) => void) => {
      mealListeners.add(onChange)
      return () => void mealListeners.delete(onChange)
    }),
  } satisfies MealApi

  /** Restricted days, with the same rules as the database. */
  const calendarApi = {
    load: vi.fn(async (householdId: string) => {
      if (net.offline) throw new CalendarError('offline')
      return structuredClone(calendar.filter((d) => d.household_id === householdId))
    }),
    subscribe: vi.fn((_householdId: string, onChange: (change: TableChange) => void) => {
      calendarListeners.add(onChange)
      return () => void calendarListeners.delete(onChange)
    }),
  } satisfies CalendarApi

  const executeCalendar = (op: OutboxOp): OpResult => {
    const valid = (d: Partial<CalendarDay>) => !d.end_date || (d.type === 'puratasi' && d.end_date >= (d.date ?? ''))
    if (op.kind === 'insert') {
      const row = op.row as unknown as CalendarDay
      if (row.household_id !== household?.id || row.created_by !== me) return { status: 'reject', message: 'row-level security' }
      if (!valid(row)) return { status: 'reject', message: 'check constraint' }
      if (calendar.some((d) => d.id === row.id)) return { status: 'ok' }
      if (calendar.some((d) => d.household_id === row.household_id && d.date === row.date && d.type === row.type)) {
        return { status: 'reject', message: 'duplicate key' }
      }
      const now = new Date().toISOString()
      const day = { ...row, created_at: now, updated_at: now }
      calendar = [...calendar, day]
      tellCalendar({ table: 'calendar_days', row: day })
      return { status: 'ok' }
    }
    const current = calendar.find((d) => d.id === op.match.id && d.household_id === household?.id)
    if (!current) return { status: 'ok' }
    if (op.kind === 'delete') {
      calendar = calendar.filter((d) => d.id !== current.id)
      tellCalendar({ table: 'calendar_days', deletedId: current.id })
      return { status: 'ok' }
    }
    const next = { ...current, ...(op.patch as Partial<CalendarDay>), updated_by: me, updated_at: new Date().toISOString() }
    if (!valid(next)) return { status: 'reject', message: 'check constraint' }
    calendar = calendar.map((d) => (d.id === next.id ? next : d))
    tellCalendar({ table: 'calendar_days', row: next })
    return { status: 'ok' }
  }

  const executeMeal = (op: OutboxOp): OpResult => {
    const table = op.table as 'meals' | 'leftovers'
    const rows = (): { id: string; household_id: string }[] => (table === 'meals' ? meals : leftovers)
    const setRows = (next: { id: string }[]) => {
      if (table === 'meals') meals = next as MealRecord[]
      else leftovers = next as Leftover[]
    }
    const stamp = { updated_by: me, updated_at: new Date().toISOString() }
    if (op.kind === 'insert') {
      const row = op.row as Record<string, unknown> & { id: string }
      if (row.household_id !== household?.id || row.created_by !== me) return { status: 'reject', message: 'row-level security' }
      if (table === 'meals' && row.id !== `${row.household_id}:${row.date}:${row.meal}`) return { status: 'reject', message: 'check constraint' }
      if (rows().some((r) => r.id === row.id)) return { status: 'ok' } // Already there: the first one stands.
      const created_at = new Date().toISOString()
      const next = { ...row, created_at, updated_at: created_at, updated_by: me }
      setRows([...rows(), next])
      tellMeal({ table, row: next })
      return { status: 'ok' }
    }
    const current = rows().find((r) => r.id === op.match.id && r.household_id === household?.id)
    if (!current) return { status: 'ok' }
    if (op.kind === 'delete') {
      setRows(rows().filter((r) => r.id !== current.id))
      tellMeal({ table, deletedId: current.id })
      return { status: 'ok' }
    }
    const next = { ...current, ...op.patch, ...stamp } as Record<string, unknown> & { id: string }
    if (table === 'meals' && next.status === 'cooked' && !next.cooked_at) return { status: 'reject', message: 'check constraint' }
    setRows(rows().map((r) => (r.id === current.id ? next : r)))
    tellMeal({ table, row: next })
    return { status: 'ok' }
  }

  const executeDish = (op: OutboxOp): OpResult => {
    const stamp = { updated_by: me, updated_at: new Date().toISOString() }
    if (op.kind === 'insert') {
      const row = op.row as unknown as Dish
      if (row.household_id !== household?.id || row.created_by !== me) return { status: 'reject', message: 'row-level security' }
      if (dishes.some((d) => d.id === row.id)) return { status: 'ok' }
      const created_at = new Date().toISOString()
      const dish = { ...row, created_at, updated_at: created_at }
      dishes = [...dishes, dish]
      tellDish({ table: 'dishes', row: dish })
      return { status: 'ok' }
    }
    const current = dishes.find((d) => d.id === op.match.id && d.household_id === household?.id)
    if (!current) return { status: 'ok' } // No matching row: nothing changes.
    if (op.kind === 'delete') {
      deleteDish(current.id)
      return { status: 'ok' }
    }
    const patch = op.patch as Partial<Dish>
    if (patch.side_ids?.includes(current.id)) return { status: 'reject', message: 'check constraint' }
    const dish = { ...current, ...patch, ...stamp }
    dishes = dishes.map((d) => (d.id === dish.id ? dish : d))
    tellDish({ table: 'dishes', row: dish })
    return { status: 'ok' }
  }

  /** A queued item or stock event reaching the "server". */
  const insertStock = (op: Extract<OutboxOp, { kind: 'insert' }>): OpResult => {
    const row = op.row as Record<string, unknown>
    if (row.household_id !== household?.id || row.created_by !== me) return { status: 'reject', message: 'row-level security' }
    const created_at = new Date().toISOString()
    if (op.table === 'stock_events') {
      if (events.some((e) => e.id === row.id)) return { status: 'ok' } // A replay: ignored.
      if (!items.some((i) => i.id === row.item_id)) return { status: 'reject', message: 'foreign key' }
      const event = { ...(row as unknown as StockEvent), created_at }
      events = [...events, event]
      tell({ table: 'stock_events', row: event })
    } else {
      if (items.some((i) => i.id === row.id)) return { status: 'ok' }
      const item = { ...(row as unknown as Item), created_at, updated_at: created_at }
      items = [...items, item]
      tell({ table: 'items', row: item })
    }
    return { status: 'ok' }
  }

  /** Replays outbox ops against the in-memory store, like supabaseExecutor does against Postgres. */
  const execute = vi.fn(async (op: OutboxOp): Promise<OpResult> => {
    if (net.offline) return { status: 'retry' }
    if (op.kind === 'insert' && (op.table === 'items' || op.table === 'stock_events')) return insertStock(op)
    if (op.table === 'dishes') return executeDish(op)
    if (op.table === 'meals' || op.table === 'leftovers') return executeMeal(op)
    if (op.table === 'calendar_days') return executeCalendar(op)
    if (op.kind !== 'update') return { status: 'reject', message: 'not supported in the fake' }
    const stamp = { updated_by: me, updated_at: new Date().toISOString() }
    if (op.table === 'items') {
      const current = items.find((i) => i.id === op.match.id && i.household_id === household?.id)
      if (!current) return { status: 'ok' } // No matching row: Postgres updates nothing.
      const item = { ...current, ...(op.patch as Partial<Item>), ...stamp }
      items = items.map((i) => (i.id === item.id ? item : i))
      tell({ table: 'items', row: item })
      return { status: 'ok' }
    }
    if (op.table === 'households' && household && op.match.id === household.id) {
      if (typeof op.patch.name === 'string' && op.patch.name.length > 60) return { status: 'reject', message: 'too long' }
      household = { ...household, ...(op.patch as Partial<Household>), ...stamp }
    } else if (op.table === 'profiles' && profiles.has(op.match.user_id)) {
      profiles.set(op.match.user_id, { ...profiles.get(op.match.user_id)!, ...(op.patch as Partial<Profile>), ...stamp })
    }
    return { status: 'ok' }
  })

  /** Backup reads and restores, with the same rules as the restore_snapshot SQL function. */
  const backupApi = {
    fetchTables: vi.fn(async () => {
      if (net.offline) throw offlineError()
      const memberIds = new Set(members.map((m) => m.userId))
      const mine = <T extends { household_id: string }>(rows: T[]) => structuredClone(rows.filter((r) => r.household_id === household?.id))
      return {
        profiles: [...profiles.values()].filter((p) => memberIds.has(p.user_id)).map((p) => ({ ...p })),
        items: mine(items) as unknown as Row[],
        stock_events: mine(events) as unknown as Row[],
        dishes: mine(dishes) as unknown as Row[],
        meals: mine(meals) as unknown as Row[],
        leftovers: mine(leftovers) as unknown as Row[],
        calendar_days: mine(calendar) as unknown as Row[],
      }
    }),
    restore: vi.fn(async (tables: Record<string, Row[]>) => {
      if (net.offline) throw offlineError()
      if (household?.backup_owner_id !== me) throw new HouseholdError('Only the backup owner can restore.')
      const memberIds = new Set(members.map((m) => m.userId))
      for (const row of (tables.profiles ?? []) as Partial<Profile>[]) {
        const current = row.user_id && profiles.get(row.user_id)
        if (!current || !memberIds.has(current.user_id)) continue
        profiles.set(current.user_id, {
          ...current,
          display_name: row.display_name ?? current.display_name,
          script_pref: row.script_pref ?? current.script_pref,
          theme_pref: row.theme_pref ?? current.theme_pref,
        })
      }
      // Items and their events are replaced together; a backup from before Batch 2
      // has neither and leaves them alone. household_id is forced to this household.
      if ('items' in tables) {
        const hid = household.id
        const others = <T extends { household_id: string }>(rows: T[]) => rows.filter((r) => r.household_id !== hid)
        items = [...others(items), ...(tables.items as unknown as Item[]).map((r) => ({ ...r, household_id: hid }))]
        events = [...others(events), ...((tables.stock_events ?? []) as unknown as StockEvent[]).map((r) => ({ ...r, household_id: hid }))]
      }
      // A backup made before Batch 3 has no dishes, and leaves them alone.
      if ('dishes' in tables) {
        const hid = household.id
        dishes = [
          ...dishes.filter((d) => d.household_id !== hid),
          ...(tables.dishes as unknown as Dish[]).map((r) => ({ ...r, household_id: hid })),
        ]
      }
      // A backup made before Batch 4 has no meals. Meal ids carry the household, so
      // they're re-keyed; a leftover keeps links only to a meal and dish that are here.
      if ('meals' in tables) {
        const hid = household.id
        const rekey = (id: string) => `${hid}:${id.split(':')[1]}:${id.split(':')[2]}`
        meals = [
          ...meals.filter((m) => m.household_id !== hid),
          ...(tables.meals as unknown as MealRecord[]).map((m) => ({ ...m, household_id: hid, id: `${hid}:${m.date}:${m.meal}` })),
        ]
        leftovers = [
          ...leftovers.filter((l) => l.household_id !== hid),
          ...((tables.leftovers ?? []) as unknown as Leftover[]).map((l) => {
            const meal_id = l.meal_id && meals.some((m) => m.id === rekey(l.meal_id!)) ? rekey(l.meal_id) : null
            const dish_id = l.dish_id && dishes.some((d) => d.id === l.dish_id && d.household_id === hid) ? l.dish_id : null
            return { ...l, household_id: hid, meal_id, dish_id }
          }),
        ]
      }
      // A backup made before Batch 5 has no calendar, and leaves it alone.
      if ('calendar_days' in tables) {
        const hid = household.id
        calendar = [
          ...calendar.filter((d) => d.household_id !== hid),
          ...(tables.calendar_days as unknown as CalendarDay[]).map((d) => ({ ...d, household_id: hid })),
        ]
      }
    }),
  } satisfies BackupApi

  return {
    ...(api satisfies HouseholdApi),
    backupApi,
    stockApi,
    dishApi,
    mealApi,
    calendarApi,
    execute,
    /** Read the "server" side, to check what was actually saved. */
    server: {
      household: () => household,
      profile: (id: string) => profiles.get(id),
      items: () => items,
      events: () => events,
      /** The other phone (user-2) records stock; this phone hears about it live unless told otherwise. */
      otherPhoneRecords(event: Omit<StockEvent, 'household_id' | 'created_by' | 'created_at'>, { live = true } = {}) {
        const row: StockEvent = { ...event, household_id: household!.id, created_by: 'user-2', created_at: new Date().toISOString() }
        events = [...events, row]
        if (live && !net.offline) tell({ table: 'stock_events', row })
        return row
      },
      dishes: () => dishes,
      meals: () => meals,
      calendar: () => calendar,
      /** Restricted days already in the household (as seeded: unverified unless said). */
      addCalendarDays(...days: (Pick<CalendarDay, 'date' | 'type'> & Partial<CalendarDay>)[]) {
        for (const d of days) {
          const day: CalendarDay = {
            id: `cal-${calendar.length + 1}`,
            household_id: household!.id,
            end_date: null,
            label: '',
            verified: false,
            note: null,
            created_by: null,
            created_at: T0,
            updated_by: null,
            updated_at: T0,
            ...d,
          }
          calendar = [...calendar, day]
          if (!net.offline) tellCalendar({ table: 'calendar_days', row: day })
        }
      },
      /** The other phone confirms or edits a day. */
      otherPhoneEditsCalendarDay(id: string, patch: Partial<CalendarDay>) {
        const day = { ...calendar.find((d) => d.id === id)!, ...patch, updated_by: 'user-2', updated_at: new Date().toISOString() }
        calendar = calendar.map((d) => (d.id === id ? day : d))
        if (!net.offline) tellCalendar({ table: 'calendar_days', row: day })
      },
      leftovers: () => leftovers,
      /** The other phone (user-2) plans or cooks a meal. */
      otherPhonePutsMeal(row: Pick<MealRecord, 'date' | 'meal' | 'dish_ids'> & Partial<MealRecord>) {
        const id = `${household!.id}:${row.date}:${row.meal}`
        const now = new Date().toISOString()
        const meal: MealRecord = {
          id,
          household_id: household!.id,
          dish_names: [],
          status: 'planned',
          cooked_by: null,
          cooked_at: null,
          created_by: 'user-2',
          created_at: now,
          updated_by: 'user-2',
          updated_at: now,
          ...row,
        }
        meals = [...meals.filter((m) => m.id !== id), meal]
        if (!net.offline) tellMeal({ table: 'meals', row: meal })
        return meal
      },
      /** The other phone records leftovers. */
      otherPhoneAddsLeftover(row: Pick<Leftover, 'dish_id' | 'name_ta' | 'name_en' | 'servings' | 'expires_on'> & Partial<Leftover>) {
        const now = new Date().toISOString()
        const leftover: Leftover = {
          id: `lo-${leftovers.length + 1}`,
          household_id: household!.id,
          meal_id: null,
          eaten_at: null,
          eaten_by: null,
          created_by: 'user-2',
          created_at: now,
          updated_by: 'user-2',
          updated_at: now,
          ...row,
        }
        leftovers = [...leftovers, leftover]
        if (!net.offline) tellMeal({ table: 'leftovers', row: leftover })
        return leftover
      },
      /** The other phone edits a dish. */
      otherPhoneEditsDish(id: string, patch: Partial<Dish>) {
        const dish = { ...dishes.find((d) => d.id === id)!, ...patch, updated_by: 'user-2', updated_at: new Date().toISOString() }
        dishes = dishes.map((d) => (d.id === id ? dish : d))
        if (!net.offline) tellDish({ table: 'dishes', row: dish })
      },
      /** More dishes in the library (as if added earlier), for tests that need more choice. */
      addDishes(...extra: (Pick<Dish, 'id' | 'name_en'> & Partial<Dish>)[]) {
        for (const d of extra) {
          const dish: Dish = {
            household_id: household!.id,
            catalog_key: null,
            name_ta: `${d.name_en} (ta)`,
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
            created_at: T0,
            updated_by: null,
            updated_at: T0,
            ...d,
          }
          dishes = [...dishes, dish]
          tellDish({ table: 'dishes', row: dish })
        }
      },
      /** The other phone deletes a dish. */
      otherPhoneDeletesDish: (id: string) => deleteDish(id),
      /** The other phone edits an item. */
      otherPhoneEditsItem(id: string, patch: Partial<Item>) {
        const item = { ...items.find((i) => i.id === id)!, ...patch, updated_by: 'user-2', updated_at: new Date().toISOString() }
        items = items.map((i) => (i.id === id ? item : i))
        if (!net.offline) tell({ table: 'items', row: item })
      },
    },
    setOffline: (value: boolean) => {
      net.offline = value
    },
    setBackupOwner: (userId: string) => {
      if (household) household = { ...household, backup_owner_id: userId }
    },
  }
}
