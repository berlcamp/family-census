import { supabase } from '@/lib/supabase/client'

/** GET a JSON API route with the signed-in user's token; throws the API's error message. */
export async function authFetch(url: string, signal?: AbortSignal) {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    signal
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body
}
