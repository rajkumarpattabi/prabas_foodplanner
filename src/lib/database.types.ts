// Types for the Supabase schema, in the shape `supabase gen types` produces.
// Keep in step with supabase/migrations/. Tables are added here batch by batch.

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
