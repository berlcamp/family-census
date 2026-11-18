import { isOwner } from '@/lib/constants'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'
import { normTown } from './apMembersAccess'

type Admin = ReturnType<typeof getSupabaseAdmin>

export type Caller = {
  email: string
  userId: number | null
  type: string | null
  municipality: string | null
  owner: boolean
}

/** The signed-in, active user behind the request's bearer token (server only). */
export async function getCaller(
  request: NextRequest,
  admin: Admin
): Promise<Caller | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: auth, error } = await admin.auth.getUser(token)
  const email = auth.user?.email?.toLowerCase()
  if (error || !email) return null

  const { data: me } = await admin
    .from('users')
    .select('id, type, address')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()
  const owner = isOwner(email)
  if (!me && !owner) return null
  return {
    email,
    userId: me?.id ?? null,
    type: me?.type ?? null,
    municipality: normTown(me?.address) || null,
    owner
  }
}

/**
 * Who may review NR proofs (approve / reject, see the photos):
 *   - owner: every municipality
 *   - province admin, super admin: their own municipality
 * Returns the municipality they are limited to (null = all), or false.
 */
export function reviewScope(c: Caller): string | null | false {
  if (c.owner) return null
  if ((c.type === 'province admin' || c.type === 'super admin') && c.municipality) {
    return c.municipality
  }
  return false
}

/**
 * May this caller upload a proof for a person in this barangay? Same rule as
 * editing a household card (canEdit on the households page): the
 * municipality's editing switch is on, and the caller is a super/province
 * admin of that municipality or an encoder marked editor of the barangay.
 * The owner always may.
 */
export async function canEditLocation(
  admin: Admin,
  c: Caller,
  location: { id: number; address: string | null }
) {
  if (c.owner) return true
  const town = normTown(location.address)

  const { data: setting } = await admin
    .from('location_settings')
    .select('enable_edit')
    .eq('address', location.address ?? '')
    .maybeSingle()
  if (!setting?.enable_edit) return false

  if (c.type === 'super admin' || c.type === 'province admin') {
    return !!town && c.municipality === town
  }
  if (c.type === 'user' && c.userId) {
    const { data: access } = await admin
      .from('location_users')
      .select('is_editor, is_disabled')
      .eq('location_id', location.id)
      .eq('user_id', c.userId)
      .maybeSingle()
    return access?.is_editor === true && access.is_disabled !== true
  }
  return false
}
