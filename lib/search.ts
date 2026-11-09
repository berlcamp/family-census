import { supabase } from '@/lib/supabase/client'
import type { Family, Household } from '@/types'

/** Max households returned by one search. */
export const SEARCH_LIMIT = 40

export type HouseholdSearchResult = Household & {
  families: Family[]
  /** Names inside this household that matched every search word. */
  matched: string[]
  /** Found only by spelling similarity, e.g. "shiela" -> "SHELLA". */
  similar?: boolean
  /** For similar results: the name that resembled the search. */
  similarTo?: string
}

/** Max extra "similar spelling" households shown after the exact ones. */
export const SIMILAR_LIMIT = 20

/**
 * Strip characters that would break PostgREST's or()/and() filter grammar,
 * then split the query into words. Every word must appear in the name, so
 * "dela cruz juan" and "juan dela cruz" both find "DELA CRUZ, JUAN".
 */
export function tokenize(query: string): string[] {
  return query
    .replace(/[(),*%\\"'.]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 5)
}

/** and(col.ilike.*a*,col.ilike.*b*) — every token must match this column. */
function andGroup(column: string, tokens: string[]) {
  const parts = tokens.map((token) => `${column}.ilike.*${token}*`)
  return parts.length === 1 ? parts[0] : `and(${parts.join(',')})`
}

function nameMatches(name: string | null | undefined, tokens: string[]) {
  if (!name) return false
  const haystack = name.toLowerCase()
  return tokens.every((token) => haystack.includes(token.toLowerCase()))
}

const HOUSEHOLD_SELECT = `
  id, name, purok, sitio, barangay, address, location_id,
  families ( id, household_id, husband_name, wife_name, all_nr,
    family_members ( id, fullname, relation, is_registered )
  )
`

/**
 * Search every parent (husband / wife) and family member by name and return
 * the whole household for each hit. Uses ILIKE '%word%' per word, which the
 * gin_trgm indexes on husband_name, wife_name and fullname serve directly.
 */
export async function searchHouseholds(
  rawQuery: string,
  {
    address,
    signal
  }: {
    /** Restrict results to one municipality (households.address). */
    address?: string | null
    signal?: AbortSignal
  } = {}
): Promise<HouseholdSearchResult[]> {
  const tokens = tokenize(rawQuery)
  if (tokens.length === 0) return []

  // 1. Parents — stored on the family row.
  let parentSearch = supabase
    .from('families')
    .select(address ? 'household_id, households!inner(address)' : 'household_id')
    .or(`${andGroup('husband_name', tokens)},${andGroup('wife_name', tokens)}`)
  if (address) parentSearch = parentSearch.eq('households.address', address)

  // 2. Children / other members.
  let memberSearch = supabase
    .from('family_members')
    .select(
      address
        ? 'families!inner(household_id, households!inner(address))'
        : 'families!inner(household_id)'
    )
  if (address) {
    memberSearch = memberSearch.eq('families.households.address', address)
  }
  for (const token of tokens) {
    memberSearch = memberSearch.ilike('fullname', `%${token}%`)
  }

  // 3. Similar spellings (asenso.search_households_fuzzy, see
  //    supabase/fuzzy_search.sql). Optional: if the function is missing or
  //    fails, exact results are still returned.
  let fuzzySearch = supabase.rpc('search_households_fuzzy', {
    p_query: tokens.join(' '),
    p_address: address ?? null,
    p_limit: SIMILAR_LIMIT + SEARCH_LIMIT
  })
  if (signal) fuzzySearch = fuzzySearch.abortSignal(signal)
  const fuzzy = Promise.resolve(fuzzySearch).then(
    ({ data, error }) => {
      if (error) {
        console.warn('[search] similar-name search unavailable:', error.message)
        return []
      }
      return (data ?? []) as { household_id: number; matched_name: string }[]
    },
    () => [] as { household_id: number; matched_name: string }[]
  )

  const [parents, members, similarRows] = await Promise.all([
    signal
      ? parentSearch.limit(SEARCH_LIMIT * 3).abortSignal(signal)
      : parentSearch.limit(SEARCH_LIMIT * 3),
    signal
      ? memberSearch.limit(SEARCH_LIMIT * 3).abortSignal(signal)
      : memberSearch.limit(SEARCH_LIMIT * 3),
    fuzzy
  ])

  if (parents.error) throw parents.error
  if (members.error) throw members.error

  const ids: number[] = []
  const seen = new Set<number>()
  const push = (id?: number | null) => {
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  ;(parents.data as unknown as { household_id: number }[] | null)?.forEach(
    (row) => push(row.household_id)
  )
  ;(members.data as unknown as { families: unknown }[] | null)?.forEach((row) => {
    const family = row.families as { household_id: number } | null
    push(family?.household_id)
  })

  const exactIds = ids.slice(0, SEARCH_LIMIT)
  const exactSet = new Set(exactIds)
  const similarTo = new Map<number, string>()
  for (const row of similarRows) {
    if (similarTo.size >= SIMILAR_LIMIT) break
    if (!exactSet.has(row.household_id)) {
      similarTo.set(row.household_id, row.matched_name)
    }
  }

  const allIds = [...exactIds, ...similarTo.keys()]
  if (allIds.length === 0) return []

  const households = await hydrateHouseholds(allIds, tokens, address, signal)
  return households.map((household) =>
    similarTo.has(household.id)
      ? { ...household, similar: true, similarTo: similarTo.get(household.id) }
      : household
  )
}

/** Fetch full households for the matched ids, keeping the search order. */
async function hydrateHouseholds(
  ids: number[],
  tokens: string[],
  address?: string | null,
  signal?: AbortSignal
): Promise<HouseholdSearchResult[]> {
  let query = supabase.from('households').select(HOUSEHOLD_SELECT).in('id', ids)
  if (address) query = query.eq('address', address)
  if (signal) query = query.abortSignal(signal)

  const { data, error } = await query
  if (error) throw error

  const byId = new Map<number, HouseholdSearchResult>()
  for (const row of (data ?? []) as unknown as Household[]) {
    const families = ((row.families ?? []) as Family[]).sort(
      (a, b) => a.id - b.id
    )
    byId.set(row.id, {
      ...row,
      families,
      matched: collectMatches(families, tokens)
    })
  }

  return ids
    .map((id) => byId.get(id))
    .filter(Boolean) as HouseholdSearchResult[]
}

function collectMatches(families: Family[], tokens: string[]) {
  const matches: string[] = []
  for (const family of families) {
    if (nameMatches(family.husband_name, tokens)) {
      matches.push(family.husband_name)
    }
    if (nameMatches(family.wife_name, tokens)) matches.push(family.wife_name)
    for (const member of family.family_members ?? []) {
      if (nameMatches(member.fullname, tokens)) matches.push(member.fullname)
    }
  }
  return matches
}
