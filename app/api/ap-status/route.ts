import { isOwner } from '@/lib/constants'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * AP status (from the AP crossmatch, asenso.ap_person_status) for the people
 * in the given households, for the AP badge on the household cards.
 *
 * The crossmatch tables are server-only, so this route reads them with the
 * service role, after checking the caller may see AP status at all (for now
 * only the owner and province admins) and those households:
 *   - owner: any household
 *   - province admin: households in their own municipality
 *
 * Response: { families: { [familyId]: { husband, wife } },
 *             members:  { [familyMemberId]: ap } }
 * where ap is true (AP), false (not AP) or null (pending review / not
 * crossmatched yet, e.g. added after the run).
 */

type Admin = ReturnType<typeof getSupabaseAdmin>
const CHUNK = 300
const MAX_HOUSEHOLDS = 100

function chunks<T>(list: T[]) {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

async function allowedHouseholds(admin: Admin, token: string, ids: number[]) {
  const { data: auth, error } = await admin.auth.getUser(token)
  const email = auth.user?.email?.toLowerCase()
  if (error || !email) return null

  const { data: me } = await admin
    .from('users')
    .select('type, address')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()
  if (!me) return null

  const { data: households, error: hhError } = await admin
    .from('households')
    .select('id, location_id, address')
    .in('id', ids)
  if (hhError) throw hhError

  if (isOwner(email)) return households.map((h) => h.id)

  // AP badges are limited to province admins (and the owner) for now.
  if (me.type !== 'province admin') return null

  const mine = (me.address ?? '').trim().toUpperCase()
  return households
    .filter((h) => (h.address ?? '').trim().toUpperCase() === mine)
    .map((h) => h.id)
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as {
      householdIds?: unknown
    } | null
    const ids = Array.isArray(body?.householdIds)
      ? [...new Set(body.householdIds.filter((v): v is number => Number.isInteger(v)))]
      : []
    if (ids.length === 0 || ids.length > MAX_HOUSEHOLDS) {
      return NextResponse.json(
        { error: `Send 1 to ${MAX_HOUSEHOLDS} household ids` },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdmin()
    const householdIds = await allowedHouseholds(admin, token, ids)
    if (householdIds === null) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    if (householdIds.length === 0) {
      return NextResponse.json({ families: {}, members: {} })
    }

    const { data: families, error: famError } = await admin
      .from('families')
      .select('id')
      .in('household_id', householdIds)
    if (famError) throw famError
    const familyIds = (families ?? []).map((f) => f.id)

    const result: {
      families: Record<number, { husband: boolean | null; wife: boolean | null }>
      members: Record<number, boolean | null>
    } = { families: {}, members: {} }

    for (const part of chunks(familyIds)) {
      const { data, error } = await admin
        .from('ap_person_status')
        .select('person_type, person_id, ap')
        .in('person_type', ['husband', 'wife'])
        .in('person_id', part)
      if (error) throw error
      for (const p of data ?? []) {
        const slot = (result.families[p.person_id] ??= { husband: null, wife: null })
        slot[p.person_type as 'husband' | 'wife'] = p.ap
      }
    }

    const memberIds: number[] = []
    for (const part of chunks(familyIds)) {
      const { data, error } = await admin
        .from('family_members')
        .select('id')
        .in('family_id', part)
      if (error) throw error
      memberIds.push(...(data ?? []).map((m) => m.id))
    }
    for (const part of chunks(memberIds)) {
      const { data, error } = await admin
        .from('ap_person_status')
        .select('person_id, ap')
        .eq('person_type', 'member')
        .in('person_id', part)
      if (error) throw error
      for (const p of data ?? []) result.members[p.person_id] = p.ap
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('ap-status route failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
