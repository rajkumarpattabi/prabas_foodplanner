import { describeError, HouseholdError } from '../household/api.ts'
import type { Supabase } from '../lib/supabase.ts'
import type { Row } from './format.ts'
import type { BackedUpTable } from './tables.ts'

export interface BackupApi {
  /** Reads every backed-up table for the household. Needs to be online. */
  fetchTables(householdId: string, tables: readonly BackedUpTable[]): Promise<Record<string, Row[]>>
  /** Replaces the household's data with a validated backup's tables, all at once. */
  restore(tables: Record<string, Row[]>): Promise<void>
}

export function supabaseBackupApi(sb: Supabase): BackupApi {
  // Tables arrive batch by batch, so they are named by string here.
  const from = (table: string) => sb.from(table as never) as unknown as ReturnType<Supabase['from']>

  return {
    async fetchTables(householdId, tables) {
      const out: Record<string, Row[]> = {}
      try {
        for (const t of tables) {
          // RLS limits "people" tables (profiles) to me and my co-members.
          const q = t.scope === 'household' ? from(t.name).select('*').eq('household_id' as never, householdId as never) : from(t.name).select('*')
          const { data, error } = await q
          if (error) throw new HouseholdError(describeError(error))
          out[t.name] = (data ?? []) as Row[]
        }
      } catch (e) {
        if (e instanceof HouseholdError) throw e
        throw new HouseholdError(describeError({ code: '', message: String((e as Error)?.message ?? e) }))
      }
      return out
    },

    async restore(tables) {
      try {
        const { error } = await sb.rpc('restore_snapshot', { p_tables: tables })
        if (error?.code === '42501') throw new HouseholdError('Only the backup owner can restore.')
        if (error) throw new HouseholdError(describeError(error))
      } catch (e) {
        if (e instanceof HouseholdError) throw e
        throw new HouseholdError(describeError({ code: '', message: String((e as Error)?.message ?? e) }))
      }
    },
  }
}
