import type { PostgrestError } from '@supabase/supabase-js'
import type { Supabase } from './supabase.ts'

type Row = Record<string, unknown>

// Supabase caps each response (1000 rows by default, and it can be set lower), so
// read in pages by id until one comes back empty. Paging by id stays correct while
// rows are being added.
const PAGE = 1000

/**
 * Every row of a household-scoped table. Throws `onError(error)` if a page fails.
 * Tables arrive batch by batch, so they're named by string.
 */
export async function readAll(
  sb: Supabase,
  table: string,
  householdId: string,
  onError: (error: PostgrestError) => Error,
): Promise<Row[]> {
  const from = () => sb.from(table as never) as unknown as ReturnType<Supabase['from']>
  const rows: Row[] = []
  for (let after: string | null = null; ; ) {
    let q = from().select('*').eq('household_id' as never, householdId as never).order('id' as never).limit(PAGE)
    if (after) q = q.gt('id' as never, after as never)
    const { data, error } = await q
    if (error) throw onError(error)
    if (!data?.length) return rows
    rows.push(...(data as Row[]))
    after = String((data.at(-1) as Row).id)
  }
}
