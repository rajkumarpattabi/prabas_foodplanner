// Items and stock events, as stored (see supabase/migrations/0004_items_and_stock.sql).

export const CATEGORIES = [
  'vegetable',
  'greens',
  'fruit',
  'meat',
  'fish',
  'egg',
  'dairy',
  'grain',
  'dal',
  'spice',
  'oil',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

/** How an item's quantity is stored. Weights in grams, liquids in ml, the rest counted. */
export type BaseUnit = 'g' | 'ml' | 'piece' | 'bunch' | 'packet'
/** What people type and read: base units plus kg and litres. */
export type EntryUnit = BaseUnit | 'kg' | 'l'

export interface Item {
  id: string
  household_id: string
  name_ta: string
  name_en: string
  aliases: string[]
  category: Category
  unit: BaseUnit
  /** Preferred unit for display and entry, for example kg for an item stored in g. */
  display_unit: EntryUnit
  /** Days a fresh purchase lasts; null for things that keep (rice, dal, spices). */
  shelf_life_days: number | null
  is_staple: boolean
  /** Running low below this, in the base unit; null for none. */
  low_threshold: number | null
  /** Weight of one piece or bunch, for converting between pieces and grams. */
  piece_weight_g: number | null
  /** Tracked as whole and opened separately (coconut, milk packets). */
  has_opened_form: boolean
  opened_shelf_life_days: number | null
  /** The +/− step, in the base unit. */
  step: number
  archived: boolean
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
}

export type StockKind = 'delta' | 'set' | 'expiry' | 'open'
export type StockReason = 'bought' | 'cooked' | 'used' | 'spoiled' | 'correction'
export type Form = 'whole' | 'opened'

/**
 * One change to stock. Never updated or deleted; current stock is replayed from these.
 * - delta: add (positive) or take (negative) `quantity`
 * - set: a correction to exactly `quantity`
 * - expiry: change the expiry of purchase `batch_id` to `expires_on`
 * - open: move `quantity` from whole to opened (coconut)
 */
export interface StockEvent {
  id: string
  household_id: string
  item_id: string
  kind: StockKind
  quantity: number
  reason: StockReason | null
  batch_id: string | null
  /** For a purchase: its expiry, if the user changed the default. For kind expiry: the new date. */
  expires_on: string | null
  form: Form
  note: string | null
  /** When it happened on the phone (kept for changes made offline). */
  occurred_at: string
  created_by: string | null
  created_at: string
}
