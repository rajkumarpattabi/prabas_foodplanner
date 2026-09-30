import { vi } from 'vitest'
import { HouseholdError, type Household, type HouseholdApi, type Profile } from '../household/api.ts'
import type { BackupApi } from '../backup/api.ts'
import type { Row } from '../backup/format.ts'
import type { OutboxOp } from '../offline/db.ts'
import type { OpResult } from '../offline/outbox.ts'
import { normaliseJoinCode } from '../household/joinCode.ts'
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
    items = starterItems('hh-1')
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
      items = starterItems('hh-1')
    }),
    joinHousehold: vi.fn(async (code: string) => {
      await write()
      if (household) throw new HouseholdError("You're already in a household.")
      if (normaliseJoinCode(code) !== other.join_code) {
        throw new HouseholdError("That code didn't match a household. Check it with the person who shared it.")
      }
      household = makeHousehold(other.id, other.name, other.join_code, 'user-2')
      members.push({ userId: 'user-2', role: 'owner' }, { userId: me, role: 'member' })
      items = starterItems(other.id)
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
      return { profiles: [...profiles.values()].filter((p) => memberIds.has(p.user_id)).map((p) => ({ ...p })) }
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
    }),
  } satisfies BackupApi

  return {
    ...(api satisfies HouseholdApi),
    backupApi,
    stockApi,
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
