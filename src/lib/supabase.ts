import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL || 'https://xjbczicveswmvfezogzz.supabase.co').trim()
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xnN5J4Tkvd1ut8GL0oLM6w_xnbokGv0').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars.')
}

declare global {
  interface Window {
    __sharedCalendarClient?: SupabaseClient
  }
}

const client =
  typeof window !== 'undefined' && window.__sharedCalendarClient
    ? window.__sharedCalendarClient
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })

if (typeof window !== 'undefined' && !window.__sharedCalendarClient) {
  window.__sharedCalendarClient = client
}

export const supabase = client
