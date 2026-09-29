import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

export type Supabase = SupabaseClient<Database>

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The shared Supabase client, or null when the build has no Supabase settings
 * (the app then shows a "not set up" screen instead of failing).
 * The session is kept in local storage, so the app opens signed in, even offline.
 */
export const supabase: Supabase | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null
