// Bills and the names they teach, as stored (see supabase/migrations/0016_bills.sql).

import type { LocalDate } from '../lib/dates.ts'

export interface Bill {
  id: string
  household_id: string
  /** The shop's name as typed or read ('' if none). */
  vendor: string
  bill_date: LocalDate
  total: number | null
  /** How many lines went into stock. */
  lines: number
  created_by: string | null
  created_at: string
}

/** A bill's word for an item, mapped by hand once (see match.ts BillAlias). */
export interface BillAliasRow {
  id: string
  household_id: string
  /** Normalised shop name, or '' for any shop. */
  vendor: string
  /** Normalised bill text. */
  raw: string
  item_id: string
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}
