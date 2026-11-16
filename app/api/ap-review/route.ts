import { isOwner } from '@/lib/constants'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Review queue for the AP crossmatch (asenso.ap_match_results).
 *
 * The matcher leaves is_ap = null when a name match is uncertain. Here the
 * owner looks at each one and accepts or rejects it; the decision is stored in
 * review_decision and picked up by asenso.ap_family_summary.
 *
 * Owner only (OWNER_EMAILS). Nothing outside ap_match_results' review columns
 * is ever written.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>

const CHUNK = 300

async function requireOwner(request: NextRequest, admin: Admin) {
  const token = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  const email = data.user?.email?.toLowerCase()
  if (error || !email || !isOwner(email)) return null
  return email
}

function chunks<T>(list: T[]) {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

const RESULT_COLUMNS =
  'id, person_type, person_id, fullname, linked_voter_id, town, barangay, ' +
  'matched_voter_id, voter_match_status, voter_match_reason, voter_in_census_elsewhere, ' +
  'existing_member_id, em_match_status, em_match_reason, possible_duplicate, ' +
  'review_decision, reviewed_by, reviewed_at'

type ResultRow = {
  id: number
  person_type: 'member' | 'husband' | 'wife'
  person_id: number
  fullname: string | null
  linked_voter_id: number | null
  town: string | null
  barangay: string | null
  matched_voter_id: number | null
  voter_match_status: string | null
  voter_match_reason: string | null
  voter_in_census_elsewhere: boolean | null
  existing_member_id: number | null
  em_match_status: string | null
  em_match_reason: string | null
  possible_duplicate: boolean | null
  review_decision: 'accept' | 'reject' | null
  reviewed_by: string | null
  reviewed_at: string | null
}

async function loadSummary(admin: Admin) {
  const { data, error } = await admin
    .from('ap_review_queue_summary')
    .select('town, barangay, to_review, reviewed')
    .order('town')
    .order('barangay')
    .limit(5000)
  if (error) throw error
  return data
}

async function loadItems(
  admin: Admin,
  town: string,
  barangay: string,
  status: string
) {
  // 1. Undecided-by-matcher rows in this barangay.
  const rows: ResultRow[] = []
  for (let from = 0; ; from += 1000) {
    let q = admin
      .from('ap_match_results')
      .select(RESULT_COLUMNS)
      .is('is_ap', null)
      .eq('town', town)
      .eq('barangay', barangay)
    if (status === 'pending') q = q.is('review_decision', null)
    if (status === 'reviewed') q = q.not('review_decision', 'is', null)
    const { data, error } = await q
      .order('fullname')
      .order('id')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as unknown as ResultRow[]))
    if (!data || data.length < 1000) break
  }
  if (rows.length === 0) return []

  // 2. Family of each person.
  const memberIds = rows.filter((r) => r.person_type === 'member').map((r) => r.person_id)
  const familyOf = new Map<string, number>()
  for (const ids of chunks(memberIds)) {
    const { data, error } = await admin
      .from('family_members')
      .select('id, family_id')
      .in('id', ids)
    if (error) throw error
    for (const m of data ?? []) familyOf.set(`member:${m.id}`, m.family_id)
  }
  for (const r of rows) {
    if (r.person_type !== 'member') familyOf.set(`${r.person_type}:${r.person_id}`, r.person_id)
  }
  const familyIds = [...new Set(familyOf.values())]

  // 3. Family heads (context for the reviewer).
  const families = new Map<number, { husband_name: string | null; wife_name: string | null }>()
  for (const ids of chunks(familyIds)) {
    const { data, error } = await admin
      .from('families')
      .select('id, husband_name, wife_name')
      .in('id', ids)
    if (error) throw error
    for (const f of data ?? []) families.set(f.id, f)
  }

  // 4. Families that already have an AP member: reviewing more names there
  //    does not change the report.
  const familiesWithAp = new Set<number>()
  for (const ids of chunks(familyIds)) {
    const { data, error } = await admin
      .from('ap_person_status')
      .select('family_id')
      .in('person_type', ['husband', 'wife'])
      .in('person_id', ids)
      .eq('ap', true)
    if (error) throw error
    for (const p of data ?? []) familiesWithAp.add(p.family_id)
  }
  const allMembers: { id: number; family_id: number }[] = []
  for (const ids of chunks(familyIds)) {
    const { data, error } = await admin
      .from('family_members')
      .select('id, family_id')
      .in('family_id', ids)
    if (error) throw error
    allMembers.push(...(data ?? []))
  }
  for (const ids of chunks(allMembers.map((m) => m.id))) {
    const { data, error } = await admin
      .from('ap_person_status')
      .select('family_id')
      .eq('person_type', 'member')
      .in('person_id', ids)
      .eq('ap', true)
    if (error) throw error
    for (const p of data ?? []) familiesWithAp.add(p.family_id)
  }

  // 5. Candidates the matcher proposed.
  const voterIds = [...new Set(rows.map((r) => r.matched_voter_id).filter((v): v is number => !!v))]
  const voters = new Map<number, Record<string, unknown>>()
  for (const ids of chunks(voterIds)) {
    const { data, error } = await admin
      .from('voters')
      .select('id, fullname, barangay, address, is_ap, ap_revoked')
      .in('id', ids)
    if (error) throw error
    for (const v of data ?? []) voters.set(v.id, v)
  }
  const emIds = [...new Set(rows.map((r) => r.existing_member_id).filter((v): v is number => !!v))]
  const members = new Map<number, Record<string, unknown>>()
  for (const ids of chunks(emIds)) {
    const { data, error } = await admin
      .schema('public')
      .from('existing_members')
      .select('id, lastname, firstname, middlename, fullname, barangay, municipality, ap_revoked')
      .in('id', ids)
    if (error) throw error
    for (const m of data ?? []) {
      const built = [m.lastname, [m.firstname, m.middlename].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
      members.set(m.id, { ...m, fullname: m.fullname || built || null })
    }
  }

  return rows.map((r) => {
    const familyId = familyOf.get(`${r.person_type}:${r.person_id}`) ?? null
    const voter = r.matched_voter_id ? voters.get(r.matched_voter_id) ?? null : null
    const em = r.existing_member_id ? members.get(r.existing_member_id) ?? null : null
    // What "accept" means for the report (same rule as asenso.ap_person_status).
    const acceptGivesAp =
      r.em_match_status === 'review'
        ? true
        : !!voter && voter.is_ap === true && voter.ap_revoked !== true
    return {
      ...r,
      family_id: familyId,
      family: familyId ? families.get(familyId) ?? null : null,
      family_has_ap: familyId ? familiesWithAp.has(familyId) : false,
      voter,
      existing_member: em,
      accept_gives_ap: acceptGivesAp
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!(await requireOwner(request, admin))) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    const params = request.nextUrl.searchParams
    const town = params.get('town')
    const barangay = params.get('barangay')
    if (town === null || barangay === null) {
      return NextResponse.json({ summary: await loadSummary(admin) })
    }
    const status = params.get('status') ?? 'pending'
    if (!['pending', 'reviewed', 'all'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    return NextResponse.json({ items: await loadItems(admin, town, barangay, status) })
  } catch (error) {
    console.error('ap-review GET failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const email = await requireOwner(request, admin)
    if (!email) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown
      decision?: unknown
    } | null
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((v): v is number => Number.isInteger(v))
      : []
    const decision = body?.decision ?? null
    if (ids.length === 0 || ids.length > 500) {
      return NextResponse.json({ error: 'Send 1 to 500 ids' }, { status: 400 })
    }
    if (decision !== null && decision !== 'accept' && decision !== 'reject') {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    }

    // Only rows the matcher left undecided can be reviewed.
    const { data, error } = await admin
      .from('ap_match_results')
      .update({
        review_decision: decision,
        reviewed_by: decision ? email : null,
        reviewed_at: decision ? new Date().toISOString() : null
      })
      .in('id', ids)
      .is('is_ap', null)
      .select('id, review_decision, reviewed_by, reviewed_at')
    if (error) throw error
    return NextResponse.json({ updated: data })
  } catch (error) {
    console.error('ap-review POST failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
