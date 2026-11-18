import { MUNICIPALITIES } from '@/lib/constants'
import { normTown } from '@/lib/server/apMembersAccess'
import { canEditLocation, getCaller, reviewScope } from '@/lib/server/nrProofAccess'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * NR proof of registration (Voter's Certificate photo), asenso.nr_proofs.
 *
 *   POST  (multipart: file, personType, familyId, memberId?)
 *         Upload a proof for an NR person on a household card. Same people
 *         who can edit that card.
 *   GET   ?status=pending|approved|rejected|all&municipality=&barangay=&page=
 *         Review list with signed photo URLs. Owner (all), province admin and
 *         super admin (own municipality).
 *   PATCH { id, decision: 'approve' | 'reject', note? }  Same reviewers.
 *         Approving makes the person count as registered in the reports:
 *         families.all_nr is cleared, and for a family member
 *         family_members.is_registered is set (voter_id stays empty). The
 *         dashboard's registered counts add approved proofs
 *         (supabase/nr_proofs.sql).
 *
 * Photos live in the private bucket nr-proofs. See supabase/nr_proofs.sql.
 */

const BUCKET = 'nr-proofs'
const MAX_BYTES = 1024 * 1024 // the browser sends ~100 KB; this is the hard cap
const PAGE_SIZE = 24
const SIGNED_URL_SECONDS = 60 * 60

type Admin = ReturnType<typeof getSupabaseAdmin>
type PersonType = 'husband' | 'wife' | 'member'

const normName = (v?: string | null) =>
  (v ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status })

/** WebP (RIFF....WEBP) or JPEG (FF D8 FF), checked on the bytes themselves. */
function imageKind(bytes: Uint8Array): 'image/webp' | 'image/jpeg' | null {
  if (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  return null
}

/** The NR person a proof is for, with where they live. Null if not found / not NR. */
async function findPerson(
  admin: Admin,
  personType: PersonType,
  familyId: number,
  memberId: number | null
) {
  const { data: family, error } = await admin
    .from('families')
    .select('id, household_id, husband_id, husband_name, wife_id, wife_name')
    .eq('id', familyId)
    .maybeSingle()
  if (error) throw error
  if (!family) return { error: 'Family not found.' }

  let fullname: string | null = null
  if (personType === 'husband') {
    if (family.husband_id) return { error: 'This person is already a registered voter.' }
    fullname = family.husband_name
  } else if (personType === 'wife') {
    if (family.wife_id) return { error: 'This person is already a registered voter.' }
    fullname = family.wife_name
  } else {
    const { data: member, error: mErr } = await admin
      .from('family_members')
      .select('id, fullname, voter_id, is_registered')
      .eq('id', memberId ?? 0)
      .eq('family_id', familyId)
      .maybeSingle()
    if (mErr) throw mErr
    if (!member) return { error: 'Family member not found.' }
    if (member.voter_id && member.is_registered) {
      return { error: 'This person is already a registered voter.' }
    }
    fullname = member.fullname
  }
  if (!normName(fullname)) return { error: 'This person has no name on the card.' }

  const { data: household, error: hErr } = await admin
    .from('households')
    .select('id, location_id')
    .eq('id', family.household_id)
    .maybeSingle()
  if (hErr) throw hErr
  if (!household?.location_id) return { error: 'Household not found.' }

  const { data: location, error: lErr } = await admin
    .from('locations')
    .select('id, name, address')
    .eq('id', household.location_id)
    .maybeSingle()
  if (lErr) throw lErr
  if (!location) return { error: 'Barangay not found.' }

  return {
    person: { fullname: (fullname ?? '').trim(), householdId: household.id as number },
    location: location as { id: number; name: string | null; address: string | null }
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const caller = await getCaller(request, admin)
    if (!caller) return fail('Not signed in.', 401)

    const form = await request.formData().catch(() => null)
    if (!form) return fail('Bad upload.', 400)
    const personType = String(form.get('personType') ?? '') as PersonType
    const familyId = Number(form.get('familyId'))
    const memberId = form.get('memberId') ? Number(form.get('memberId')) : null
    const file = form.get('file')

    if (!['husband', 'wife', 'member'].includes(personType)) return fail('Bad person.', 400)
    if (!Number.isInteger(familyId) || familyId <= 0) return fail('Bad family.', 400)
    if (personType === 'member' && !(Number.isInteger(memberId) && (memberId ?? 0) > 0)) {
      return fail('Bad member.', 400)
    }
    if (!(file instanceof Blob) || file.size === 0) return fail('No photo.', 400)
    if (file.size > MAX_BYTES) return fail('Photo is too big (max 1 MB).', 413)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = imageKind(bytes)
    if (!kind) return fail('Only photos (WebP or JPEG) are accepted.', 415)

    const found = await findPerson(admin, personType, familyId, personType === 'member' ? memberId : null)
    if ('error' in found) return fail(found.error ?? 'Not found.', 404)
    const { person, location } = found

    if (!(await canEditLocation(admin, caller, location))) {
      return fail('You cannot edit households in this barangay.', 403)
    }

    // Open proofs for this person. An approved one for the same name blocks a
    // new upload; one for a different name (the person on the card was
    // changed) and any pending one get replaced by this upload.
    let openQuery = admin
      .from('nr_proofs')
      .select('id, status, fullname')
      .eq('family_id', familyId)
      .eq('person_type', personType)
      .in('status', ['pending', 'approved'])
    openQuery =
      personType === 'member' ? openQuery.eq('member_id', memberId) : openQuery.is('member_id', null)
    const { data: open, error: openErr } = await openQuery
    if (openErr) throw openErr
    if (open?.some((p) => p.status === 'approved' && normName(p.fullname) === normName(person.fullname))) {
      return fail('A proof for this person is already approved.', 409)
    }

    const town = normTown(location.address)
    const ext = kind === 'image/webp' ? 'webp' : 'jpg'
    const path = `${town.replace(/[^A-Z0-9]+/g, '_')}/${familyId}/${personType}-${
      memberId ?? familyId
    }-${Date.now()}.${ext}`

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: kind, upsert: false })
    if (upErr) throw upErr

    const replacedIds = (open ?? []).map((p) => p.id)
    if (replacedIds.length) {
      const { error } = await admin
        .from('nr_proofs')
        .update({ status: 'replaced' })
        .in('id', replacedIds)
        .in('status', ['pending', 'approved'])
      if (error) {
        await admin.storage.from(BUCKET).remove([path])
        throw error
      }
    }

    const { data: row, error: insErr } = await admin
      .from('nr_proofs')
      .insert({
        person_type: personType,
        family_id: familyId,
        member_id: personType === 'member' ? memberId : null,
        fullname: person.fullname,
        household_id: person.householdId,
        location_id: location.id,
        municipality: town,
        barangay: location.name,
        file_path: path,
        file_size: bytes.length,
        submitted_by: caller.email
      })
      .select('id, family_id, person_type, member_id, fullname, status')
      .single()
    if (insErr) {
      // Put things back the way they were.
      await admin.storage.from(BUCKET).remove([path])
      for (const p of open ?? []) {
        await admin.from('nr_proofs').update({ status: p.status }).eq('id', p.id).eq('status', 'replaced')
      }
      if (insErr.code === '23505') {
        return fail('Someone just submitted a proof for this person. Reload the page.', 409)
      }
      throw insErr
    }

    return NextResponse.json({ proof: row })
  } catch (e) {
    console.error('nr-proofs POST', e)
    return fail('Could not save the proof.', 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const caller = await getCaller(request, admin)
    const scope = caller ? reviewScope(caller) : false
    if (scope === false) return fail('Not allowed', 403)

    const params = request.nextUrl.searchParams
    const status = params.get('status') ?? 'pending'
    const requested = normTown(params.get('municipality'))
    // Owner: any municipality, or all when none is given.
    const town =
      scope ?? (requested && MUNICIPALITIES.includes(requested) ? requested : null)
    const barangay = params.get('barangay')?.trim() || null
    const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)

    let q = admin
      .from('nr_proofs')
      .select(
        'id, person_type, family_id, member_id, fullname, household_id, location_id, ' +
          'municipality, barangay, file_path, status, submitted_by, submitted_at, ' +
          'reviewed_by, reviewed_at, review_note',
        { count: 'exact' }
      )
    if (town) q = q.eq('municipality', town)
    if (barangay) q = q.eq('barangay', barangay)
    if (status === 'all') q = q.neq('status', 'replaced')
    else if (['pending', 'approved', 'rejected'].includes(status)) q = q.eq('status', status)
    else return fail('Bad status.', 400)

    const { data, count, error } = await q
      .order('submitted_at', { ascending: status !== 'pending' ? false : true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as unknown as {
      file_path: string
      [k: string]: unknown
    }[]

    const urls = new Map<string, string>()
    if (rows.length) {
      const { data: signed, error: sErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(
          rows.map((r) => r.file_path),
          SIGNED_URL_SECONDS
        )
      if (sErr) throw sErr
      for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
    }

    // Barangays with pending proofs, for the filter.
    let bq = admin.from('nr_proofs').select('barangay').eq('status', 'pending').limit(5000)
    if (town) bq = bq.eq('municipality', town)
    const { data: pend, error: pErr } = await bq
    if (pErr) throw pErr
    const pendingByBarangay: Record<string, number> = {}
    for (const p of pend ?? []) {
      const b = p.barangay ?? '—'
      pendingByBarangay[b] = (pendingByBarangay[b] ?? 0) + 1
    }

    return NextResponse.json({
      items: rows.map(({ file_path, ...r }) => ({ ...r, photo_url: urls.get(file_path) ?? null })),
      total: count ?? 0,
      pageSize: PAGE_SIZE,
      municipality: town,
      lockedMunicipality: scope,
      pendingByBarangay
    })
  } catch (e) {
    console.error('nr-proofs GET', e)
    return fail('Could not load the proofs.', 500)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const caller = await getCaller(request, admin)
    const scope = caller ? reviewScope(caller) : false
    if (!caller || scope === false) return fail('Not allowed', 403)

    const body = await request.json().catch(() => ({}))
    const id = Number(body.id)
    const decision = body.decision
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null
    if (!Number.isInteger(id) || id <= 0) return fail('Bad id.', 400)
    if (decision !== 'approve' && decision !== 'reject') return fail('Bad decision.', 400)

    const { data: proof, error } = await admin
      .from('nr_proofs')
      .select('id, municipality, status, person_type, family_id, member_id, fullname')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!proof) return fail('Proof not found.', 404)
    if (scope && proof.municipality !== scope) return fail('Not allowed', 403)
    if (proof.status !== 'pending') return fail('This proof was already reviewed.', 409)

    // Approve only while the same NR person is still on the card.
    if (decision === 'approve') {
      const found = await findPerson(
        admin,
        proof.person_type as PersonType,
        proof.family_id,
        proof.member_id
      )
      if ('error' in found) {
        return fail(`Cannot approve: ${found.error} Reject it instead.`, 409)
      }
      if (normName(found.person.fullname) !== normName(proof.fullname)) {
        return fail(
          `Cannot approve: the name on the card is now ${found.person.fullname}. Reject it and ask for a new upload.`,
          409
        )
      }
    }

    const { data: updated, error: uErr } = await admin
      .from('nr_proofs')
      .update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewed_by: caller.email,
        reviewed_at: new Date().toISOString(),
        review_note: note
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id, status, reviewed_by, reviewed_at, review_note')
      .maybeSingle()
    if (uErr) throw uErr
    if (!updated) return fail('This proof was already reviewed.', 409)

    if (decision === 'approve') {
      // Count the person as registered wherever the reports look.
      const markFamily = admin
        .from('families')
        .update({ all_nr: false })
        .eq('id', proof.family_id)
        .eq('all_nr', true)
      const markMember =
        proof.person_type === 'member'
          ? admin
              .from('family_members')
              .update({ is_registered: true })
              .eq('id', proof.member_id)
              .eq('family_id', proof.family_id)
              .is('voter_id', null)
          : Promise.resolve({ error: null })
      const [fRes, mRes] = await Promise.all([markFamily, markMember])
      const markErr = fRes.error ?? mRes.error
      if (markErr) {
        // Undo the decision so it can be tried again.
        await admin
          .from('nr_proofs')
          .update({ status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null })
          .eq('id', id)
          .eq('status', 'approved')
        throw markErr
      }
    }

    return NextResponse.json({ proof: updated })
  } catch (e) {
    console.error('nr-proofs PATCH', e)
    return fail('Could not save the decision.', 500)
  }
}
