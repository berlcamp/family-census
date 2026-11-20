import { apMembersAccess } from '@/lib/server/apMembersAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Married-name review (owner page /married-review).
 *
 * NR people whose voter record may still carry their maiden name, saved in
 * asenso.married_name_candidates by supabase/married_name_review.sql.
 * GET lists every candidate (about 1,000); POST confirms, rejects or undoes
 * one through asenso.married_review_decide, which links the person to the
 * voter (registered, and AP in Ozamiz when the voter is AP).
 *
 * Owner: every municipality. Province admin: their own municipality only
 * (same access rule as AP Members, lib/server/apMembersAccess).
 * The table and the function are server-only (service role).
 */

type Admin = ReturnType<typeof getSupabaseAdmin>

const COLUMNS =
  'id, match_id, person_type, family_id, household_id, town, barangay, census_name, ' +
  'voter_id, voter_name, voter_barangay, voter_is_ap, n_candidates, status, ' +
  'reviewed_by, reviewed_at'

const DECISIONS = ['confirm', 'reject', 'undo'] as const

/** Every candidate the caller may see: all for the owner, own town otherwise. */
function listCandidates(admin: Admin, town: string | null) {
  let query = admin.from('married_name_candidates').select(COLUMNS)
  if (town) query = query.eq('town', town)
  return query.order('town').order('barangay').order('census_name').limit(10000)
}

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const access = await apMembersAccess(request, admin)
    if (!access) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    const { data, error } = await listCandidates(
      admin,
      access.owner ? null : access.municipality
    )
    if (error) throw error
    return NextResponse.json({ rows: data ?? [], generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('married-review GET failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const access = await apMembersAccess(request, admin)
    if (!access) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    const scopeTown = access.owner ? null : access.municipality
    const body = (await request.json().catch(() => null)) as {
      id?: unknown
      decision?: unknown
    } | null
    const id = body?.id
    const decision = body?.decision
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
    if (!DECISIONS.includes(decision as (typeof DECISIONS)[number])) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
    }

    // Province admins may only decide on candidates in their own municipality.
    if (scopeTown) {
      const { data: row, error: rowError } = await admin
        .from('married_name_candidates')
        .select('town')
        .eq('id', id as number)
        .maybeSingle()
      if (rowError) throw rowError
      if (!row || row.town !== scopeTown) {
        return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
      }
    }

    const { error } = await admin.rpc('married_review_decide', {
      p_id: id,
      p_decision: decision,
      p_by: access.email
    })
    // Raised by the function (already linked, voter taken, …): show as is.
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })

    // Return the whole list again: a confirm can supersede other rows.
    const { data, error: listError } = await listCandidates(admin, scopeTown)
    if (listError) throw listError
    return NextResponse.json({ rows: data ?? [] })
  } catch (error) {
    console.error('married-review POST failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
