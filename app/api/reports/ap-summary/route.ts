import { isOwner } from '@/lib/constants'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * AP family summary per municipality / barangay (asenso.ap_family_summary),
 * for the owner-only /reports page. The view is server-only, so it is read
 * here with the service role after checking the caller is the owner.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !isOwner(auth.user?.email)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    // Same rows as the ap_family_summary view, but run with more work_mem so
    // it stays under the 8s statement timeout (supabase/ap_family_summary_report.sql).
    const { data, error } = await admin
      .rpc('ap_family_summary_report')
      .select('*')
      .order('municipality')
      .order('barangay')
      .limit(5000)
    if (error) throw error

    return NextResponse.json({
      rows: data,
      generatedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('reports/ap-summary failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
