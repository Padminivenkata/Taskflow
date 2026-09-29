import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The app is useless without a backend, and silently falling back to mock data
 * would violate the "PostgreSQL is the single source of truth" rule. So we
 * fail loudly and render a configuration screen instead of booting.
 */
export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'))

if (!isSupabaseConfigured) {
  console.error(
    '[Taskflow] Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'taskflow.auth',
      flowType: 'pkce',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: { 'x-application-name': 'taskflow' },
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  },
)

/** Human readable errors — every failure surfaces as a real message. */
export function describeError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback
  if (typeof error === 'string') return error
  const err = error as { message?: string; code?: string; details?: string; hint?: string }

  switch (err.code) {
    case '42501':
      return err.message || 'Permission denied. Your role does not allow this action.'
    case '23505':
      return 'That record already exists.'
    case '23514':
      return err.message || 'That value is not allowed.'
    case '23503':
      return 'Related record is missing. Refresh and try again.'
    case 'PGRST116':
      return 'Record not found. It may have been deleted by another user.'
    case '23502':
      return err.message || 'A required field is missing.'
    default:
      return err.message || fallback
  }
}

export function isNetworkError(error: unknown): boolean {
  const err = error as { message?: string; code?: string }
  if (err?.code === 'PGRST000') return true
  const m = (err?.message ?? '').toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('websocket')
  )
}
