import { isOwner, MUNICIPALITIES } from '@/lib/constants'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

type Admin = ReturnType<typeof getSupabaseAdmin>

export const normTown = (v?: string | null) => (v ?? '').trim().toUpperCase()

/**
 * Who may use the AP Members page (server only).
 *   - owner: every municipality
 *   - province admin: their own municipality only (same rule as AP badges,
 *     app/api/ap-status)
 * Returns null when the caller is not allowed.
 */
export async function apMembersAccess(
  request: NextRequest,
  admin: Admin
): Promise<{ owner: boolean; municipality: string | null } | null> {
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: auth, error } = await admin.auth.getUser(token)
  const email = auth.user?.email?.toLowerCase()
  if (error || !email) return null

  const { data: me } = await admin
    .from('users')
    .select('type, address')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()

  if (isOwner(email)) {
    return { owner: true, municipality: normTown(me?.address) || null }
  }
  if (me?.type === 'province admin' && normTown(me.address)) {
    return { owner: false, municipality: normTown(me.address) }
  }
  return null
}

/** The municipality this caller may read, given the one they asked for. */
export function allowedTown(
  access: { owner: boolean; municipality: string | null },
  requested: string | null
) {
  if (!access.owner) return access.municipality
  const town = normTown(requested)
  if (town && MUNICIPALITIES.includes(town)) return town
  return access.municipality || MUNICIPALITIES[0]
}
