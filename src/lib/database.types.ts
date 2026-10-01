// Types for the Supabase schema, in the shape `supabase gen types` produces.
// Keep in step with supabase/migrations/. Tables are added here batch by batch.

import type { CalendarDay as CalendarDayInterface } from '../calendar/types.ts'
import type { Dish as DishInterface } from '../dishes/types.ts'
import type { Leftover as LeftoverInterface, MealRecord as MealInterface } from '../plan/types.ts'
import type { Batch as BatchInterface, BatchEvent as BatchEventInterface } from '../prepared/types.ts'
import type { ShoppingItem as ShoppingItemInterface } from '../shop/types.ts'
import type { Item as ItemInterface, StockEvent as StockEventInterface } from '../stock/types.ts'

// supabase-js needs plain object types for rows (interfaces don't fit its table
// constraint), so the interfaces are flattened here.
type Plain<T> = { [K in keyof T]: T[K] }
type Item = Plain<ItemInterface>
type StockEvent = Plain<StockEventInterface>
type Batch = Plain<BatchInterface>
type BatchEvent = Plain<BatchEventInterface>
type ShoppingItem = Plain<ShoppingItemInterface>
type Dish = Plain<DishInterface>
type MealRow = Plain<MealInterface>
type Leftover = Plain<LeftoverInterface>
type CalendarDay = Plain<CalendarDayInterface>

type Timestamps = {
  created_by: string | null
  created_at: string
}

type Attributed = Timestamps & {
  updated_by: string | null
  updated_at: string
}

export type ScriptPref = 'ta_first' | 'en_first'
export type ThemePrefDb = 'auto' | 'light' | 'dark'
export type MemberRole = 'owner' | 'member'

export type Database = {
  public: {
    Tables: {
      households: {
        Row: Attributed & {
          id: string
          name: string
          join_code: string
          backup_owner_id: string | null
          /** When the backup owner's phone last backed up to Drive (0003). */
          drive_backup_at: string | null
        }
        Insert: never
        Update: { name?: string; backup_owner_id?: string | null; drive_backup_at?: string | null }
        Relationships: []
      }
      household_members: {
        Row: Timestamps & {
          household_id: string
          user_id: string
          role: MemberRole
        }
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: Attributed & {
          user_id: string
          display_name: string
          script_pref: ScriptPref
          theme_pref: ThemePrefDb
        }
        Insert: never
        Update: { display_name?: string; script_pref?: ScriptPref; theme_pref?: ThemePrefDb }
        Relationships: []
      }
      items: {
        Row: Item & { catalog_key: string | null }
        Insert: Partial<Item> & Pick<Item, 'household_id' | 'name_ta' | 'name_en' | 'category' | 'unit' | 'display_unit' | 'step'>
        Update: Partial<
          Pick<
            Item,
            | 'name_ta'
            | 'name_en'
            | 'aliases'
            | 'category'
            | 'display_unit'
            | 'shelf_life_days'
            | 'is_staple'
            | 'low_threshold'
            | 'piece_weight_g'
            | 'has_opened_form'
            | 'opened_shelf_life_days'
            | 'step'
            | 'archived'
          >
        >
        Relationships: []
      }
      stock_events: {
        Row: StockEvent
        Insert: Partial<StockEvent> & Pick<StockEvent, 'id' | 'household_id' | 'item_id' | 'kind' | 'quantity'>
        Update: never
        Relationships: []
      }
      dishes: {
        Row: Dish
        Insert: Partial<Dish> & Pick<Dish, 'household_id' | 'name_ta' | 'name_en' | 'type'>
        Update: Partial<Omit<Dish, 'id' | 'household_id' | 'catalog_key' | 'created_by' | 'created_at' | 'updated_by' | 'updated_at'>>
        Relationships: []
      }
      meals: {
        Row: MealRow
        Insert: Partial<MealRow> & Pick<MealRow, 'id' | 'household_id' | 'date' | 'meal' | 'dish_ids'>
        Update: Partial<Pick<MealRow, 'dish_ids' | 'dish_names' | 'status' | 'cooked_by' | 'cooked_at'>>
        Relationships: []
      }
      leftovers: {
        Row: Leftover
        Insert: Partial<Leftover> & Pick<Leftover, 'id' | 'household_id' | 'name_ta' | 'name_en' | 'servings' | 'expires_on'>
        Update: Partial<Pick<Leftover, 'servings' | 'expires_on' | 'eaten_at' | 'eaten_by'>>
        Relationships: []
      }
      calendar_days: {
        Row: CalendarDay
        Insert: Partial<CalendarDay> & Pick<CalendarDay, 'id' | 'household_id' | 'date' | 'type'>
        Update: Partial<Pick<CalendarDay, 'date' | 'end_date' | 'label' | 'verified' | 'note'>>
        Relationships: []
      }
      batches: {
        Row: Batch
        Insert: Partial<Batch> & Pick<Batch, 'id' | 'household_id' | 'name_ta' | 'name_en' | 'stages' | 'planned_start' | 'yield' | 'unit' | 'keeps_days'>
        Update: never
        Relationships: []
      }
      batch_events: {
        Row: BatchEvent
        Insert: Partial<BatchEvent> & Pick<BatchEvent, 'id' | 'household_id' | 'batch_id' | 'kind'>
        Update: never
        Relationships: []
      }
      shopping_items: {
        Row: ShoppingItem
        Insert: Partial<ShoppingItem> & Pick<ShoppingItem, 'id' | 'household_id' | 'item_id' | 'kind'>
        Update: Partial<Pick<ShoppingItem, 'quantity' | 'skip_until' | 'section' | 'done_at' | 'done_by'>>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      create_household: { Args: { p_name: string }; Returns: string }
      join_household: { Args: { p_code: string }; Returns: string }
      rotate_join_code: { Args: Record<string, never>; Returns: string }
      is_member: { Args: { hid: string }; Returns: boolean }
      shares_household: { Args: { other: string }; Returns: boolean }
      restore_snapshot: { Args: { p_tables: Record<string, Record<string, unknown>[]> }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
