// Shopping list rows, as stored (see supabase/migrations/0013_shopping.sql). Most of the
// list is worked out from stock, plans and batches; only these are stored.

import type { LocalDate } from '../lib/dates.ts'

/** want: added by hand. skip: a worked-out line hidden for a while. */
export type ShoppingKind = 'want' | 'skip'

/** The list's sections, most urgent first. */
export const SECTIONS = ['low', 'planned', 'maybe', 'added'] as const
export type SectionKey = (typeof SECTIONS)[number]

export interface ShoppingItem {
  id: string
  household_id: string
  item_id: string
  kind: ShoppingKind
  /** For want: how much, in the item's stored unit, if said. */
  quantity: number | null
  /** For skip: hidden until the end of this day. */
  skip_until: LocalDate | null
  /** For skip: the section it was skipped from; a more urgent reason shows it again. */
  section: SectionKey | null
  /** For want: ticked off (bought). */
  done_at: string | null
  done_by: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}
