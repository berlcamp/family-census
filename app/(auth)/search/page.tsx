'use client'

import { Highlight } from '@/components/Highlight'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/lib/redux/hook'
import {
  HouseholdSearchResult,
  SEARCH_LIMIT,
  searchHouseholds,
  tokenize
} from '@/lib/search'
import { Loader2, Search as SearchIcon, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchScreen />
    </Suspense>
  )
}

function SearchScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const user = useAppSelector((state) => state.user.user)

  const [term, setTerm] = useState(urlQuery)
  const [debounced] = useDebounce(term.trim(), 350)
  const [results, setResults] = useState<HouseholdSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)

  // Header search bar navigates here with a new ?q= — adopt it.
  const lastPushed = useRef(urlQuery)
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery
      setTerm(urlQuery)
    }
  }, [urlQuery])

  // Keep the term in the URL so results survive the back button. Runs only
  // when the typed term settles, so it never overwrites a header navigation.
  const urlQueryRef = useRef(urlQuery)
  urlQueryRef.current = urlQuery
  useEffect(() => {
    if (debounced === urlQueryRef.current) return
    lastPushed.current = debounced
    router.replace(
      debounced ? `/search?q=${encodeURIComponent(debounced)}` : '/search',
      { scroll: false }
    )
  }, [debounced, router])

  const tokens = useMemo(() => tokenize(debounced), [debounced])

  // Viewers are municipality-scoped: they only ever search their own address.
  const isViewer = user?.type === 'viewer'
  const scope = isViewer ? user?.address ?? null : null
  const blocked = !user || user.type === 'user' || (isViewer && !scope)

  useEffect(() => {
    setFilter(null)
    if (blocked || tokens.length === 0) {
      setResults([])
      setSearched(false)
      setLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    searchHouseholds(debounced, { address: scope, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setResults(data)
        setSearched(true)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError((err as Error).message || 'Search failed')
        setResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [debounced, tokens, scope, blocked])

  // Filter chips: by municipality when results span several, else by barangay.
  const groupBy: 'address' | 'barangay' = useMemo(() => {
    const addresses = new Set(results.map((h) => h.address).filter(Boolean))
    return addresses.size > 1 ? 'address' : 'barangay'
  }, [results])

  const groups = useMemo(() => {
    const set = new Set<string>()
    results.forEach((h) => h[groupBy] && set.add(h[groupBy] as string))
    return [...set].sort()
  }, [results, groupBy])

  const visible = filter
    ? results.filter((h) => h[groupBy] === filter)
    : results
  const exact = visible.filter((h) => !h.similar)
  const similar = visible.filter((h) => h.similar)
  const exactTotal = results.filter((h) => !h.similar).length

  if (!user) return null

  if (user.type === 'user' || (isViewer && !scope)) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-semibold mb-2 text-gray-800">
          Search access denied
        </h1>
        {isViewer && (
          <p className="text-gray-500">
            Your account has no municipality assigned. Ask the administrator
            to set one.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="sticky top-0 z-20 -mx-4 bg-white/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
          <Input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a name (e.g. dela cruz juan)…"
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 pl-10 pr-10 text-base"
            aria-label="Search household member name"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
            </button>
          )}
        </div>

        {scope && (
          <p className="mt-2 text-xs text-gray-500">
            Searching households in <b>{scope}</b> only
          </p>
        )}

        {groups.length > 1 && (
          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
            <Chip active={!filter} onClick={() => setFilter(null)}>
              All ({results.length})
            </Chip>
            {groups.map((name) => (
              <Chip
                key={name}
                active={filter === name}
                onClick={() => setFilter(name)}
              >
                {name} ({results.filter((h) => h[groupBy] === name).length})
              </Chip>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!searched && !loading && !error && (
        <p className="text-gray-500">
          Type at least 2 letters of a name. Word order doesn&apos;t matter —
          every word must appear in the name.
        </p>
      )}

      {searched && results.length === 0 && !loading && !error && (
        <p className="text-xl text-gray-600">
          No households found matching “{debounced}”. Try the last name only,
          or check the spelling.
        </p>
      )}

      {searched && exact.length === 0 && similar.length > 0 && !loading && (
        <p className="text-gray-600">
          No exact match for “{debounced}”.
        </p>
      )}

      {exact.length > 0 && (
        <>
          <p className="text-sm text-gray-500">
            {exact.length} household{exact.length === 1 ? '' : 's'} found
            {exactTotal >= SEARCH_LIMIT &&
              ` — showing the first ${SEARCH_LIMIT}, add more words to narrow down`}
          </p>
          <ResultGrid households={exact} tokens={tokens} dim={loading} />
        </>
      )}

      {similar.length > 0 && (
        <>
          <div className="pt-2">
            <h2 className="text-base font-semibold text-gray-800">
              Similar spelling
            </h2>
            <p className="text-sm text-gray-500">
              {similar.length} household{similar.length === 1 ? '' : 's'} with
              a name that sounds or is spelled like “{debounced}”
            </p>
          </div>
          <ResultGrid households={similar} tokens={tokens} dim={loading} />
        </>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'border-gray-800 bg-gray-800 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function ResultGrid({
  households,
  tokens,
  dim
}: {
  households: HouseholdSearchResult[]
  tokens: string[]
  dim: boolean
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${
        dim ? 'opacity-60' : ''
      }`}
    >
      {households.map((h) => (
        <ResultCard key={`household-${h.id}`} household={h} tokens={tokens} />
      ))}
    </div>
  )
}

/** Exact results highlight the typed words; similar results the whole name. */
function Name({
  text,
  tokens,
  similarTo
}: {
  text: string
  tokens: string[]
  similarTo?: string
}) {
  if (similarTo) {
    return text === similarTo ? (
      <mark className="rounded bg-orange-200 px-0.5">{text}</mark>
    ) : (
      <>{text}</>
    )
  }
  return <Highlight text={text} tokens={tokens} />
}

function ResultCard({
  household: h,
  tokens
}: {
  household: HouseholdSearchResult
  tokens: string[]
}) {
  return (
    <Card
      className={`rounded-none gap-3 ${
        h.similar
          ? 'border-orange-300 bg-orange-50'
          : 'border-gray-300 bg-yellow-100'
      }`}
    >
      <CardHeader>
        {h.similar && h.similarTo && (
          <p className="text-xs font-medium text-orange-700">
            Similar name: {h.similarTo}
          </p>
        )}
        <p className="text-sm text-gray-600">
          Address: {[h.purok, h.barangay, h.address].filter(Boolean).join(', ')}
        </p>
        {h.sitio && <p className="text-sm text-gray-500">Sitio: {h.sitio}</p>}
      </CardHeader>

      <CardContent>
        {h.families.map((f) => (
          <div
            key={`family-${f.id}`}
            className={`mb-3 rounded p-2 ${
              f.all_nr ? 'bg-red-100 border border-red-300' : ''
            }`}
          >
            {f.husband_name && (
              <p className="font-semibold">
                <Name text={f.husband_name} tokens={tokens} similarTo={h.similarTo} />
              </p>
            )}
            {f.wife_name && (
              <p className="font-semibold">
                <Name text={f.wife_name} tokens={tokens} similarTo={h.similarTo} />
              </p>
            )}
            {(f.family_members?.length ?? 0) > 0 && (
              <ul className="ml-4 list-disc text-sm text-gray-700">
                {f.family_members!.map((m, i) => (
                  <li key={m.id ?? i}>
                    <Name text={m.fullname} tokens={tokens} similarTo={h.similarTo} />{' '}
                    {m.is_registered ? '' : '(NR)'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
