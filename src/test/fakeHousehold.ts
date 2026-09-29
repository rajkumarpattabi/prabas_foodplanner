import { vi } from 'vitest'
import { HouseholdError, type Household, type HouseholdApi, type Profile } from '../household/api.ts'
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
  /** Make every write fail, to test rollbacks. */
  failWrites?: boolean
}

/**
 * An in-memory household backend for tests, acting as user-1. It follows the same
 * rules as the database functions: one household per person, codes must match.
 */
export function fakeHouseholdApi({ withHousehold = false, failWrites = false }: Options = {}) {
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
    if (failWrites) throw new HouseholdError("You're offline. Try again when you're connected.")
  }

  const api = {
    load: vi.fn(async () => ({
      me: { ...profiles.get(me)! },
      household: household && { ...household },
      members: members.map((m) => ({ ...m, joinedAt: T0, profile: { ...profiles.get(m.userId)! } })),
    })),
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
    renameHousehold: vi.fn(async (_id: string, name: string) => {
      await write()
      household = household && { ...household, name, updated_by: me, updated_at: new Date().toISOString() }
    }),
    updateProfile: vi.fn(async (userId: string, patch: Partial<Profile>) => {
      await write()
      profiles.set(userId, { ...profiles.get(userId)!, ...patch })
    }),
    subscribe: vi.fn(() => () => {}),
  }
  return api satisfies HouseholdApi
}
