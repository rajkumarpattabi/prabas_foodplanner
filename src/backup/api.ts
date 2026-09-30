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

const PAGE = 1000

export function supabaseBackupApi(sb: Supabase): BackupApi {
  // Tables arrive batch by batch, so they are named by string here.
  const from = (table: string) => sb.from(table as never) as unknown as ReturnType<Supabase['from']>

  return {
    async fetchTables(householdId, tables) {
      const out: Record<string, Row[]> = {}
      try {
        for (const t of tables) {
          if (t.scope === 'people') {
            // RLS limits these (profiles) to me and my co-members: a handful of rows.
            const { data, error } = await from(t.name).select('*')
            if (error) throw new HouseholdError(describeError(error))
            out[t.name] = (data ?? []) as Row[]
            continue
          }
          // Supabase caps each response (1000 rows by default), and stock events pass
          // that within a year, so read in pages by id until one comes back empty.
          const rows: Row[] = []
          for (let after: string | null = null; ; ) {
            let q = from(t.name).select('*').eq('household_id' as never, householdId as never).order('id' as never).limit(PAGE)
            if (after) q = q.gt('id' as never, after as never)
            const { data, error } = await q
            if (error) throw new HouseholdError(describeError(error))
            if (!data?.length) break
            rows.push(...(data as Row[]))
            after = String((data.at(-1) as Row).id)
          }
          out[t.name] = rows
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
