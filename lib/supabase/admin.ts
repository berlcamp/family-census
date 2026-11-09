import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. SERVER ONLY — use it from app/api route handlers.
 *
 * The key is read from SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix), so
 * Next.js never ships it to the browser. If this file is ever imported from a
 * client component the key is simply undefined there and the call throws.
 */
export function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set on the server')
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', key, {
    db: { schema: 'asenso' },
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
