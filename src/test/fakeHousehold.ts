import { vi } from 'vitest'
import { HouseholdError, type Household, type HouseholdApi, type Profile } from '../household/api.ts'
import type { BackupApi } from '../backup/api.ts'
import type { Row } from '../backup/format.ts'
import type { OutboxOp } from '../offline/db.ts'
import type { OpResult } from '../offline/outbox.ts'
import { normaliseJoinCode } from '../household/joinCode.ts'

const T0 = '2026-09-29T10:00:00.000Z'

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

  const makeHousehold = (id: string, name: string, code: string, by: string): Household => ({
    id,
    name,
    join_code: code,
    backup_owner_id: by,
    created_by: by,
    created_at: T0,
    updated_by: by,
    updated_at: T0,
  })

  if (withHousehold) {
    household = makeHousehold('hh-1', 'Prabas home', 'K7M4QP', me)
    members.push({ userId: me, role: 'owner' }, { userId: 'user-2', role: 'member' })
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
    }),
    joinHousehold: vi.fn(async (code: string) => {
      await write()
      if (household) throw new HouseholdError("You're already in a household.")
      if (normaliseJoinCode(code) !== other.join_code) {
        throw new HouseholdError("That code didn't match a household. Check it with the person who shared it.")
      }
      household = makeHousehold(other.id, other.name, other.join_code, 'user-2')
      members.push({ userId: 'user-2', role: 'owner' }, { userId: me, role: 'member' })
    }),
    rotateJoinCode: vi.fn(async () => {
      await write()
      const code = `NEWCD${++codeCounter}`.slice(0, 6)
      household = household && { ...household, join_code: code }
      return code
    }),
    subscribe: vi.fn(() => () => {}),
  }

  /** Replays outbox ops against the in-memory store, like supabaseExecutor does against Postgres. */
  const execute = vi.fn(async (op: OutboxOp): Promise<OpResult> => {
    if (net.offline) return { status: 'retry' }
    if (op.kind !== 'update') return { status: 'reject', message: 'not supported in the fake' }
    const stamp = { updated_by: me, updated_at: new Date().toISOString() }
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
    execute,
    /** Read the "server" side, to check what was actually saved. */
    server: {
      household: () => household,
      profile: (id: string) => profiles.get(id),
    },
    setOffline: (value: boolean) => {
      net.offline = value
    },
    setBackupOwner: (userId: string) => {
      if (household) household = { ...household, backup_owner_id: userId }
    },
  }
}
