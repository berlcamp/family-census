import { allowedTown, apMembersAccess } from '@/lib/server/apMembersAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50

/**
 * GET /api/ap-members?group=census|list&q=&municipality=&barangay=&page=&limit=&notInCensus=1
 *
 * AP Members search, one result group per call:
 *   census: AP people in the family census (asenso.ap_members_page over the
 *           saved list asenso.ap_members_list)
 *   list:   people on the AP lists — existing_members, members, voters is_ap
 *           (Ozamiz City: voters is_ap only — supabase/ap_members_ozamiz_voters.sql)
 *           (asenso.ap_list_members_page over asenso.ap_list_members)
 * Both saved lists are refreshed by hand (supabase/ap_search.sql).
 *
 * Owner: any municipality, or municipality=ALL for every one.
 * Province admin: their own municipality only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const access = await apMembersAccess(request, admin)
    if (!access) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const group = params.get('group') === 'list' ? 'list' : 'census'
    const wantsAll = access.owner && params.get('municipality') === 'ALL'
    const town = wantsAll ? null : allowedTown(access, params.get('municipality'))
    if (!wantsAll && !town) {
      return NextResponse.json(
        { error: 'Your account has no municipality assigned.' },
        { status: 400 }
      )
    }
    const barangay = town ? params.get('barangay')?.trim() || null : null
    // Letters, numbers, spaces and hyphens only; at most 5 words.
    const q =
      (params.get('q') ?? '')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(' ')
        .slice(0, 100) || null
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(params.get('limit') ?? '25', 10) || 25)
    )
    const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

    const list =
      group === 'census'
        ? admin.rpc('ap_members_page', {
            p_town: town,
            p_barangay: barangay,
            p_q: q,
            p_limit: limit,
            p_offset: page * limit
          })
        : admin.rpc('ap_list_members_page', {
            p_town: town,
            p_barangay: barangay,
            p_q: q,
            p_not_in_census: params.get('notInCensus') === '1',
            p_limit: limit,
            p_offset: page * limit
          })
    const brgys = town
      ? admin.from('locations').select('name').eq('address', town).order('name')
      : Promise.resolve({ data: [] as { name: string }[], error: null })

    const [res, brgyRes] = await Promise.all([list, brgys])
    if (res.error) throw res.error
    if (brgyRes.error) throw brgyRes.error

    const rows = (res.data ?? []) as Record<string, unknown>[]
    return NextResponse.json({
      group,
      municipality: town ?? 'ALL',
      canChooseMunicipality: access.owner,
      barangays: [...new Set((brgyRes.data ?? []).map((b) => b.name as string))],
      page,
      limit,
      total: rows.length ? Number(rows[0].total_count) : 0,
      refreshedAt: (rows[0]?.refreshed_at as string | undefined) ?? null,
      rows: rows.map((r) =>
        group === 'census'
          ? {
              key: `${r.person_type}-${r.person_id}`,
              person_type: r.person_type,
              person_id: r.person_id,
              fullname: r.fullname,
              barangay: r.barangay,
              municipality: r.municipality,
              household_id: r.household_id
            }
          : {
              key: `${r.municipality}-${r.barangay}-${r.fullname}`,
              fullname: r.fullname,
              barangay: r.barangay,
              municipality: r.municipality,
              sources: r.sources ?? [],
              details: r.details ?? [],
              household_id: r.household_id ?? null
            }
      )
    })
  } catch (error) {
    console.error('ap-members failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
