import { apMembersAccess, normTown } from '@/lib/server/apMembersAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ap-members/household?id=
 * One household's composition for the AP Members modal: families, members,
 * registered / Asenso flags and AP status (asenso.ap_person_status).
 * Owner: any household. Province admin: households in their municipality.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const access = await apMembersAccess(request, admin)
    if (!access) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const id = Number.parseInt(request.nextUrl.searchParams.get('id') ?? '', 10)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Bad household id' }, { status: 400 })
    }

    const { data: h, error } = await admin
      .from('households')
      .select(
        `id, name, purok, sitio, barangay, address,
         service_provider:sp_id(name),
         families (
           id, husband_name, wife_name, husband_id, wife_id, all_nr,
           asenso_husband, asenso_wife,
           family_members (id, fullname, voter_id, is_registered, asenso)
         )`
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!h) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 })
    }
    if (!access.owner && normTown(h.address) !== access.municipality) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    type Member = {
      id: number
      fullname: string
      voter_id: number | null
      is_registered: boolean | null
      asenso: boolean | null
    }
    type Family = {
      id: number
      husband_name: string | null
      wife_name: string | null
      husband_id: number | null
      wife_id: number | null
      all_nr: boolean | null
      asenso_husband: boolean | null
      asenso_wife: boolean | null
      family_members: Member[] | null
    }
    const families = ((h.families ?? []) as Family[]).sort((a, b) => a.id - b.id)
    const familyIds = families.map((f) => f.id)
    const memberIds = families.flatMap((f) => (f.family_members ?? []).map((m) => m.id))

    // AP status per person (null = pending review / not matched yet).
    const spouseAp = new Map<string, boolean | null>()
    const memberAp = new Map<number, boolean | null>()
    if (familyIds.length) {
      const { data, error: e } = await admin
        .from('ap_person_status')
        .select('person_type, person_id, ap')
        .in('person_type', ['husband', 'wife'])
        .in('person_id', familyIds)
      if (e) throw e
      for (const p of data ?? []) spouseAp.set(`${p.person_type}:${p.person_id}`, p.ap)
    }
    if (memberIds.length) {
      const { data, error: e } = await admin
        .from('ap_person_status')
        .select('person_id, ap')
        .eq('person_type', 'member')
        .in('person_id', memberIds)
      if (e) throw e
      for (const p of data ?? []) memberAp.set(p.person_id, p.ap)
    }

    const sp = h.service_provider as { name?: string } | { name?: string }[] | null
    const spName = Array.isArray(sp) ? sp[0]?.name : sp?.name

    return NextResponse.json({
      household: {
        id: h.id,
        name: h.name,
        purok: h.purok,
        sitio: h.sitio,
        barangay: h.barangay,
        municipality: h.address,
        service_provider: spName ?? null,
        families: families.map((f) => ({
          id: f.id,
          all_nr: !!f.all_nr,
          husband: f.husband_name
            ? {
                name: f.husband_name,
                registered: !!f.husband_id,
                asenso: f.asenso_husband,
                ap: spouseAp.get(`husband:${f.id}`) ?? null
              }
            : null,
          wife: f.wife_name
            ? {
                name: f.wife_name,
                registered: !!f.wife_id,
                asenso: f.asenso_wife,
                ap: spouseAp.get(`wife:${f.id}`) ?? null
              }
            : null,
          members: (f.family_members ?? [])
            .sort((a, b) => a.id - b.id)
            .map((m) => ({
              id: m.id,
              name: m.fullname,
              registered: !!m.is_registered, // same as the household cards
              asenso: m.asenso,
              ap: memberAp.get(m.id) ?? null
            }))
        }))
      }
    })
  } catch (error) {
    console.error('ap-members/household failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
