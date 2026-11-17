import { allowedTown, apMembersAccess } from '@/lib/server/apMembersAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/**
 * GET /api/ap-members?municipality=&barangay=&q=&page=
 * One page of AP people in the census (asenso.ap_members_page, which reads
 * the saved list asenso.ap_members_list, refreshed by hand), plus the
 * barangays of that municipality for the filter.
 * Owner: any municipality. Province admin: their own only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const access = await apMembersAccess(request, admin)
    if (!access) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const params = request.nextUrl.searchParams
    const town = allowedTown(access, params.get('municipality'))
    if (!town) {
      return NextResponse.json(
        { error: 'Your account has no municipality assigned.' },
        { status: 400 }
      )
    }
    const barangay = params.get('barangay')?.trim() || null
    const q = params.get('q')?.trim().slice(0, 100) || null
    const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

    const [list, brgys] = await Promise.all([
      admin.rpc('ap_members_page', {
        p_town: town,
        p_barangay: barangay,
        p_q: q,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE
      }),
      admin.from('locations').select('name').eq('address', town).order('name')
    ])
    if (list.error) throw list.error
    if (brgys.error) throw brgys.error

    const rows = (list.data ?? []) as {
      person_type: string
      person_id: number
      fullname: string
      barangay: string | null
      municipality: string | null
      household_id: number
      refreshed_at?: string | null
      total_count: number
    }[]

    return NextResponse.json({
      municipality: town,
      canChooseMunicipality: access.owner,
      barangays: [...new Set((brgys.data ?? []).map((b) => b.name as string))],
      page,
      pageSize: PAGE_SIZE,
      total: rows.length ? Number(rows[0].total_count) : 0,
      // When the saved list (asenso.ap_members_list) was last refreshed.
      refreshedAt: rows[0]?.refreshed_at ?? null,
      rows: rows.map((r) => ({
        person_type: r.person_type,
        person_id: r.person_id,
        fullname: r.fullname,
        barangay: r.barangay,
        municipality: r.municipality,
        household_id: r.household_id
      }))
    })
  } catch (error) {
    console.error('ap-members failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
