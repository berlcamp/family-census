import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export interface VoterOption {
  id?: number
  voter_id?: number | null
  fullname: string
  barangay?: string | null
  address?: string | null
  from_rpc?: boolean | null
  is_registered?: boolean
  is_asenso?: boolean
  asenso?: boolean
  member_id?: number | null
  relation?: string
}

// Barangay voter lists already loaded this session, keyed "TOWN|BARANGAY".
const voterCache = new Map<string, VoterOption[]>()
const MAX_PRELOAD = 20000

/**
 * The barangay's voters, for instant local name search. Loaded only once
 * `enabled` (i.e. a family editor is open), once per barangay per session,
 * in pages so barangays with more than 1,000 voters are not cut off.
 */
export function useBarangayVoters(
  enabled: boolean,
  town?: string | null,
  barangay?: string | null
) {
  const key = town && barangay ? `${town}|${barangay}` : ''
  const [voters, setVoters] = useState<VoterOption[]>(
    () => voterCache.get(key) ?? []
  )

  useEffect(() => {
    if (!enabled || !town || !barangay) return
    const cached = voterCache.get(key)
    if (cached) {
      setVoters(cached)
      return
    }

    let cancelled = false
    const load = async () => {
      const rows: VoterOption[] = []
      for (let from = 0; from < MAX_PRELOAD; from += 1000) {
        let q = supabase.from('voters').select('id, fullname')
        q =
          town === 'CONCEPCION'
            ? q.eq('address', town)
            : q
                .ilike('barangay', `%${barangay.trim()}%`)
                .ilike('address', `%${town.trim()}%`)
        const { data, error } = await q.order('id').range(from, from + 999)
        if (error || !data) break
        rows.push(...data)
        if (data.length < 1000) break
      }
      voterCache.set(key, rows)
      if (!cancelled) setVoters(rows)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [enabled, key, town, barangay])

  return voters
}
