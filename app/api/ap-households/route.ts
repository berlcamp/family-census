import { isOwner } from '@/lib/constants'
import { normTown } from '@/lib/server/apMembersAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type Admin = ReturnType<typeof getSupabaseAdmin>

/**
 * May this caller see AP status for this location? Same rules as the AP
 * badges (app/api/ap-status), except Ozamiz City is not always on here:
 *   - owner: any location
 *   - province admin: locations in their municipality
 *   - super admin: their municipality, and other users: locations assigned
 *     to them, but only where the owner turned on "Show AP badges"
 *     (location_settings.show_ap_badge)
 */
async function canSeeAp(admin: Admin, token: string, locationId: number) {
  const { data: auth, error } = await admin.auth.getUser(token)
  const email = auth.user?.email?.toLowerCase()
  if (error || !email) return false

  const [{ data: me }, { data: loc }] = await Promise.all([
    admin
      .from('users')
      .select('id, type, address')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle(),
    admin.from('locations').select('id, address').eq('id', locationId).maybeSingle()
  ])
  if (!me || !loc) return false
  if (isOwner(email)) return true

  const sameTown = normTown(me.address) === normTown(loc.address)
  if (me.type === 'province admin') return sameTown

  const { data: setting } = await admin
    .from('location_settings')
    .select('show_ap_badge')
    .eq('address', loc.address)
    .maybeSingle()
  if (!setting?.show_ap_badge) return false

  if (me.type === 'super admin') return sameTown
  const { data: assigned } = await admin
    .from('location_users')
    .select('location_id')
    .eq('user_id', me.id)
    .eq('location_id', locationId)
    .maybeSingle()
  return !!assigned
}

/**
 * GET /api/ap-households?locationId=
 * Ids of the households in this location with at least one AP person
 * (asenso.ap_household_ids), newest first. For the households page toggle.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const locationId = Number.parseInt(
      request.nextUrl.searchParams.get('locationId') ?? '',
      10
    )
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return NextResponse.json({ error: 'Bad location id' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!(await canSeeAp(admin, token, locationId))) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const { data, error } = await admin.rpc('ap_household_ids', {
      p_location_id: locationId
    })
    if (error) throw error
    return NextResponse.json({ ids: ((data ?? []) as (number | string)[]).map(Number) })
  } catch (error) {
    console.error('ap-households failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
