import type { PostgrestError } from '@supabase/supabase-js'
import type { MemberRole, Tables } from '../lib/database.types.ts'
import type { Supabase } from '../lib/supabase.ts'

export type Profile = Tables<'profiles'>
export type Household = Tables<'households'>
export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'script_pref' | 'theme_pref'>>

export interface Member {
  userId: string
  role: MemberRole
  joinedAt: string
  profile: Profile | null
}

/** Everything the app shell needs about "us": my profile, and my household if I have one. */
export interface HouseholdSnapshot {
  me: Profile
  household: Household | null
  members: Member[]
}

/** A failure with a message that can be shown as is. */
export class HouseholdError extends Error {}

/** What the household screens need from the backend. Tests pass an in-memory fake. */
export interface HouseholdApi {
  /** Throws HouseholdError when it can't load (for example, offline). */
  load(userId: string): Promise<HouseholdSnapshot>
  createHousehold(name: string): Promise<void>
  joinHousehold(code: string): Promise<void>
  rotateJoinCode(): Promise<string>
  renameHousehold(householdId: string, name: string): Promise<void>
  updateProfile(userId: string, patch: ProfilePatch): Promise<void>
  /** Calls onChange when anything about my household changes on another device. */
  subscribe(userId: string, householdId: string | null, onChange: () => void): () => void
}

/** Short, plain messages for the errors people can actually hit. */
export function describeError(error: Pick<PostgrestError, 'code' | 'message'>): string {
  if (error.code === 'P0002' && error.message.includes('Join code')) {
    return "That code didn't match a household. Check it with the person who shared it."
  }
  if (error.code === 'P0001' && error.message.includes('Already in a household')) {
    return "You're already in a household."
  }
  if (error.code === '23514') return 'That name is too long.'
  if (!navigator.onLine || error.message.toLowerCase().includes('fetch')) {
    return "You're offline. Try again when you're connected."
  }
  return 'Something went wrong. Try again.'
}

function check(error: PostgrestError | null): void {
  if (error) throw new HouseholdError(describeError(error))
}

async function guard<T>(run: () => PromiseLike<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof HouseholdError) throw e
    throw new HouseholdError(describeError({ code: '', message: String((e as Error)?.message ?? e) }))
  }
}

export function supabaseHouseholdApi(sb: Supabase): HouseholdApi {
  return {
    load: (userId) =>
      guard(async () => {
        const [meRes, membershipRes] = await Promise.all([
          sb.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
          sb.from('household_members').select('household_id').eq('user_id', userId).maybeSingle(),
        ])
        check(meRes.error)
        check(membershipRes.error)
        if (!meRes.data) throw new HouseholdError('Your profile is missing. Log out and in again.')

        const hid = membershipRes.data?.household_id
        if (!hid) return { me: meRes.data, household: null, members: [] }

        const [hRes, mRes, pRes] = await Promise.all([
          sb.from('households').select('*').eq('id', hid).single(),
          sb.from('household_members').select('*').eq('household_id', hid).order('created_at'),
          // RLS returns only my profile and my co-members' profiles.
          sb.from('profiles').select('*'),
        ])
        check(hRes.error)
        check(mRes.error)
        check(pRes.error)
        const profiles = new Map((pRes.data ?? []).map((p) => [p.user_id, p]))
        return {
          me: meRes.data,
          household: hRes.data,
          members: (mRes.data ?? []).map((m) => ({
            userId: m.user_id,
            role: m.role,
            joinedAt: m.created_at,
            profile: profiles.get(m.user_id) ?? null,
          })),
        }
      }),

    createHousehold: (name) =>
      guard(async () => {
        check((await sb.rpc('create_household', { p_name: name })).error)
      }),

    joinHousehold: (code) =>
      guard(async () => {
        check((await sb.rpc('join_household', { p_code: code })).error)
      }),

    rotateJoinCode: () =>
      guard(async () => {
        const { data, error } = await sb.rpc('rotate_join_code')
        check(error)
        return data as string
      }),

    renameHousehold: (householdId, name) =>
      guard(async () => {
        check((await sb.from('households').update({ name }).eq('id', householdId)).error)
      }),

    updateProfile: (userId, patch) =>
      guard(async () => {
        check((await sb.from('profiles').update(patch).eq('user_id', userId)).error)
      }),

    subscribe(userId, householdId, onChange) {
      const channel = sb.channel(`household:${householdId ?? `none:${userId}`}`)
      if (householdId) {
        channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'households', filter: `id=eq.${householdId}` }, onChange)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'household_members', filter: `household_id=eq.${householdId}` },
            onChange,
          )
          // RLS limits profile events to my household.
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, onChange)
      } else {
        // Not in a household yet: notice if I join or create one on another device.
        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'household_members', filter: `user_id=eq.${userId}` },
          onChange,
        )
      }
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
