import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const ADMIN_TYPES = ['super admin', 'province admin']

/**
 * Ensure a Supabase Auth account exists for an email and return its id.
 * Replaces the browser-side auth.admin.createUser call, which needed the
 * service-role key in the client bundle.
 *
 * Only active super admins / province admins may call it.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()

    // 1. Who is calling? Verify their Supabase session token.
    const token = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    const callerEmail = auth.user?.email?.toLowerCase()
    if (authError || !callerEmail) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const { data: caller } = await admin
      .from('users')
      .select('type')
      .eq('email', callerEmail)
      .eq('is_active', true)
      .maybeSingle()
    if (!caller || !ADMIN_TYPES.includes(caller.type)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    // 2. Validate input.
    const body = (await request.json().catch(() => null)) as {
      email?: string
    } | null
    const email = body?.email?.trim().toLowerCase() ?? ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // 3. Create the auth account, or reuse the existing one.
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        // Users sign in with Google; this password is never shown or used.
        password: randomBytes(24).toString('base64url'),
        email_confirm: true
      })

    if (created?.user?.id) {
      return NextResponse.json({ authId: created.user.id, created: true })
    }

    if (createError?.code !== 'email_exists') {
      console.error('createUser failed', createError)
      return NextResponse.json(
        { error: createError?.message ?? 'Could not create account' },
        { status: 500 }
      )
    }

    const { data: authId, error: lookupError } = await admin.rpc(
      'get_user_id_by_email',
      { p_email: email }
    )
    if (lookupError || !authId) {
      console.error('get_user_id_by_email failed', lookupError)
      return NextResponse.json(
        { error: 'Account exists but could not be found' },
        { status: 500 }
      )
    }

    return NextResponse.json({ authId, created: false })
  } catch (error) {
    console.error('auth-users route failed', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Server error' },
      { status: 500 }
    )
  }
}
