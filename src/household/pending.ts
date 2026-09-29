import type { OutboxOp } from '../offline/db.ts'
import type { Household, HouseholdSnapshot, Profile } from './api.ts'

/**
 * Lays queued, not-yet-sent changes over data loaded from the server (or the cache),
 * so a refresh never shows an older value than the one the user just set.
 */
export function applyPending(snapshot: HouseholdSnapshot, ops: readonly OutboxOp[]): HouseholdSnapshot {
  let s = snapshot
  for (const op of ops) {
    if (op.kind !== 'update') continue
    if (op.table === 'households' && s.household && op.match.id === s.household.id) {
      s = { ...s, household: { ...s.household, ...(op.patch as Partial<Household>) } }
    }
    if (op.table === 'profiles') {
      const uid = op.match.user_id
      const patch = op.patch as Partial<Profile>
      s = {
        ...s,
        me: s.me.user_id === uid ? { ...s.me, ...patch } : s.me,
        members: s.members.map((m) => (m.userId === uid && m.profile ? { ...m, profile: { ...m.profile, ...patch } } : m)),
      }
    }
  }
  return s
}
