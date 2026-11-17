'use client'

import { Highlight } from '@/components/Highlight'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isOwner, MUNICIPALITIES } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { tokenize } from '@/lib/search'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Home,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  Search,
  SearchX,
  X
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { authFetch } from './authFetch'
import HouseholdModal, { HouseholdTarget } from './HouseholdModal'

const ALL = 'ALL' // every municipality (owner) / every barangay
const PAGE_SIZE = 25
const PREVIEW_SIZE = 5
const fmt = (n: number) => new Intl.NumberFormat().format(n)

type Tab = 'all' | 'census' | 'list'

type CensusRow = {
  key: string
  person_type: 'husband' | 'wife' | 'member'
  person_id: number
  fullname: string
  barangay: string | null
  municipality: string | null
  household_id: number
}
type ListRow = {
  key: string
  fullname: string
  barangay: string | null
  municipality: string | null
  sources: string[]
  details: string[]
  household_id: number | null
}
type Group<T> = { rows: T[]; total: number; loading: boolean; error: string | null }

const ROLE: Record<CensusRow['person_type'], string> = {
  husband: 'Husband',
  wife: 'Wife',
  member: 'Family member'
}

const address = (r: { barangay: string | null; municipality: string | null }) =>
  [r.barangay, r.municipality].filter(Boolean).join(', ')

export default function ApMembersPage() {
  return (
    <Suspense fallback={null}>
      <ApMembersSearch />
    </Suspense>
  )
}

/** Search AP members: in the family census, and on the AP lists. */
function ApMembersSearch() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const params = useSearchParams()
  const owner = isOwner(user?.email)
  const allowed = owner || user?.type === 'province admin'

  // State lives in the URL (?q=&town=&brgy=&tab=&page=&nic=), so a search
  // can be shared and survives the back button.
  const [term, setTerm] = useState(params.get('q') ?? '')
  const [q] = useDebounce(term.trim(), 300)
  const [town, setTown] = useState<string | null>(params.get('town'))
  const [brgy, setBrgy] = useState(params.get('brgy') ?? ALL)
  const [tab, setTab] = useState<Tab>(
    (['census', 'list'] as const).find((t) => t === params.get('tab')) ?? 'all'
  )
  const [page, setPage] = useState(Math.max(0, Number(params.get('page')) || 0))
  const [notInCensus, setNotInCensus] = useState(params.get('nic') === '1')

  const [census, setCensus] = useState<Group<CensusRow>>({ rows: [], total: 0, loading: true, error: null })
  const [list, setList] = useState<Group<ListRow>>({ rows: [], total: 0, loading: true, error: null })
  const [resolvedTown, setResolvedTown] = useState<string | null>(null)
  const [barangays, setBarangays] = useState<string[]>([])
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [retry, setRetry] = useState(0)
  const [target, setTarget] = useState<HouseholdTarget | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const tokens = useMemo(() => tokenize(q), [q])

  useEffect(() => {
    if (user && !allowed) router.replace('/')
  }, [user, allowed, router])

  // A new search goes back to the first page.
  const [lastQ, setLastQ] = useState(q)
  if (lastQ !== q) {
    setLastQ(q)
    setPage(0)
  }

  // Keep the URL in step with the search.
  useEffect(() => {
    const next = new URLSearchParams()
    if (q) next.set('q', q)
    if (town) next.set('town', town)
    if (brgy !== ALL) next.set('brgy', brgy)
    if (tab !== 'all') next.set('tab', tab)
    if (page > 0) next.set('page', String(page))
    if (notInCensus) next.set('nic', '1')
    const qs = next.toString()
    router.replace(qs ? `/ap-members?${qs}` : '/ap-members', { scroll: false })
  }, [q, town, brgy, tab, page, notInCensus, router])

  // "/" jumps to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || el.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fetchGroup = useCallback(
    (group: 'census' | 'list', signal: AbortSignal) => {
      const size = tab === 'all' ? PREVIEW_SIZE : tab === group ? PAGE_SIZE : 1
      const p = new URLSearchParams({
        group,
        limit: String(size),
        page: String(tab === group ? page : 0)
      })
      if (q) p.set('q', q)
      if (town) p.set('municipality', town)
      if (brgy !== ALL) p.set('barangay', brgy)
      if (group === 'list' && notInCensus) p.set('notInCensus', '1')
      return authFetch(`/api/ap-members?${p}`, signal)
    },
    [q, town, brgy, tab, page, notInCensus]
  )

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    setCensus((g) => ({ ...g, loading: true, error: null }))
    setList((g) => ({ ...g, loading: true, error: null }))

    const settle = <T,>(
      group: 'census' | 'list',
      set: React.Dispatch<React.SetStateAction<Group<T>>>
    ) =>
      fetchGroup(group, controller.signal)
        .then((body) => {
          set({ rows: body.rows ?? [], total: body.total ?? 0, loading: false, error: null })
          setResolvedTown(body.municipality ?? null)
          setBarangays(body.barangays ?? [])
          // Empty results carry no date: keep the last one shown.
          if (body.refreshedAt) setRefreshedAt(new Date(body.refreshedAt))
        })
        .catch((e) => {
          if (controller.signal.aborted) return
          set({ rows: [], total: 0, loading: false, error: (e as Error).message })
        })

    void settle<CensusRow>('census', setCensus)
    void settle<ListRow>('list', setList)
    return () => controller.abort()
  }, [allowed, fetchGroup, retry])

  if (!user || !allowed) return null

  const shownTown = town ?? resolvedTown
  const allTowns = shownTown === ALL
  const loading = census.loading || list.loading
  const scope = allTowns
    ? 'all municipalities'
    : [brgy !== ALL ? brgy : null, shownTown].filter(Boolean).join(', ')

  const openCensus = (r: CensusRow) =>
    setTarget({
      householdId: r.household_id,
      person: { type: r.person_type, id: r.person_id },
      name: r.fullname,
      address: address(r)
    })
  const openList = (r: ListRow) =>
    r.household_id &&
    setTarget({ householdId: r.household_id, name: r.fullname, address: address(r) })

  const changeTab = (next: Tab) => {
    setTab(next)
    setPage(0)
  }

  const noResults = !loading && !census.error && !list.error && census.total === 0 && list.total === 0

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6">
      {/* Header */}
      <header className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white shadow-sm" aria-hidden>
          <BadgeCheck className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">AP Members</h1>
          <p className="text-sm text-gray-600">
            Search AP members in the family census and on the AP lists.
          </p>
        </div>
      </header>

      {/* Search */}
      <form role="search" onSubmit={(e) => e.preventDefault()} className="space-y-3">
        <label htmlFor="ap-search" className="sr-only">
          Search a name
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input
            ref={inputRef}
            id="ap-search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a name, e.g. dela cruz juan"
            enterKeyHint="search"
            autoComplete="off"
            className="h-12 rounded-xl border-gray-300 bg-white pl-12 pr-12 text-base shadow-sm"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {term && !loading ? (
              <button
                type="button"
                onClick={() => {
                  setTerm('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="grid size-9 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                <X className="size-4" />
              </button>
            ) : (
              loading && (
                <span className="grid size-9 place-items-center text-gray-400" aria-hidden>
                  <Loader2 className="size-4 animate-spin" />
                </span>
              )
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {owner ? (
            <Select
              value={shownTown ?? undefined}
              onValueChange={(v) => {
                setTown(v)
                setBrgy(ALL)
                setPage(0)
              }}
            >
              <SelectTrigger className="h-11 w-full bg-white sm:h-9 sm:w-60" aria-label="Municipality">
                <Building2 className="size-4 text-gray-500" aria-hidden />
                <SelectValue placeholder="Municipality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All municipalities</SelectItem>
                {MUNICIPALITIES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className="inline-flex h-11 items-center gap-2 rounded-md border bg-gray-50 px-3 text-sm text-gray-700 sm:h-9"
              title="Province admins search their own municipality"
            >
              <Lock className="size-3.5 text-gray-500" aria-hidden />
              {shownTown ?? '…'}
            </span>
          )}

          <Select
            value={brgy}
            disabled={allTowns}
            onValueChange={(v) => {
              setBrgy(v)
              setPage(0)
            }}
          >
            <SelectTrigger className="h-11 w-full bg-white sm:h-9 sm:w-56" aria-label="Barangay">
              <MapPin className="size-4 text-gray-500" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All barangays</SelectItem>
              {barangays.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {brgy !== ALL && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 text-gray-600 sm:h-9"
              onClick={() => {
                setBrgy(ALL)
                setPage(0)
              }}
            >
              <X className="size-4" /> Clear barangay
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Every word must appear in the name, in any order. Press{' '}
          <kbd className="rounded border bg-gray-50 px-1 font-sans">/</kbd> to search.
        </p>
      </form>

      {/* Results */}
      <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)} className="mt-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0">
          <ResultTab value="all" label="All" />
          <ResultTab value="census" label="In family census" icon={<Home className="size-4" />} count={census.total} loading={census.loading} />
          <ResultTab value="list" label="On AP lists" icon={<ListChecks className="size-4" />} count={list.total} loading={list.loading} />
        </TabsList>

        <p className="sr-only" aria-live="polite">
          {loading
            ? 'Searching'
            : `${census.total} in the family census, ${list.total} on the AP lists`}
        </p>

        {noResults ? (
          <NoResults
            q={q}
            scope={scope}
            canClearBrgy={brgy !== ALL}
            canSearchAll={owner && !allTowns}
            onClearBrgy={() => setBrgy(ALL)}
            onSearchAll={() => {
              setTown(ALL)
              setBrgy(ALL)
            }}
            onClearSearch={() => setTerm('')}
          />
        ) : (
          <>
            <TabsContent value="all" className="space-y-8 pt-4">
              <Section
                title="In family census"
                hint="Click a name to see the household."
                icon={<Home className="size-4" />}
                group={census}
                onRetry={() => setRetry((n) => n + 1)}
                rows={census.rows.map((r) => (
                  <CensusResult key={r.key} row={r} tokens={tokens} onOpen={() => openCensus(r)} />
                ))}
                more={
                  census.total > census.rows.length && (
                    <SeeAll n={census.total} label="in the family census" onClick={() => changeTab('census')} />
                  )
                }
              />
              <Section
                title="On AP lists"
                hint="AP member lists and the voters list. Some are not in the census yet."
                icon={<ListChecks className="size-4" />}
                group={list}
                onRetry={() => setRetry((n) => n + 1)}
                rows={list.rows.map((r) => (
                  <ListResult key={r.key} row={r} tokens={tokens} onOpen={() => openList(r)} />
                ))}
                more={
                  list.total > list.rows.length && (
                    <SeeAll n={list.total} label="on the AP lists" onClick={() => changeTab('list')} />
                  )
                }
              />
            </TabsContent>

            <TabsContent value="census" className="pt-4">
              <Section
                group={census}
                onRetry={() => setRetry((n) => n + 1)}
                skeletonRows={8}
                rows={census.rows.map((r) => (
                  <CensusResult key={r.key} row={r} tokens={tokens} onOpen={() => openCensus(r)} />
                ))}
                more={<Pager page={page} total={census.total} loading={census.loading} onPage={setPage} />}
              />
            </TabsContent>

            <TabsContent value="list" className="pt-4">
              <label className="mb-3 inline-flex cursor-pointer items-center gap-2.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={notInCensus}
                  onChange={(e) => {
                    setNotInCensus(e.target.checked)
                    setPage(0)
                  }}
                />
                <span
                  className="relative h-5 w-9 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-blue-700 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2"
                  aria-hidden
                />
                Only people not in the census yet
              </label>
              <Section
                group={list}
                onRetry={() => setRetry((n) => n + 1)}
                skeletonRows={8}
                rows={list.rows.map((r) => (
                  <ListResult key={r.key} row={r} tokens={tokens} onOpen={() => openList(r)} />
                ))}
                more={<Pager page={page} total={list.total} loading={list.loading} onPage={setPage} />}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {refreshedAt && (
        <p className="mt-10 text-center text-xs text-gray-500">
          Lists as of{' '}
          {refreshedAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}. The
          household view is always current.
        </p>
      )}

      <HouseholdModal target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

function ResultTab({
  value,
  label,
  icon,
  count,
  loading
}: {
  value: Tab
  label: string
  icon?: React.ReactNode
  count?: number
  loading?: boolean
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-gray-600 shadow-none hover:text-gray-900 data-[state=active]:border-blue-700 data-[state=active]:bg-transparent data-[state=active]:text-blue-800 data-[state=active]:shadow-none"
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className="min-w-6 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs tabular-nums text-gray-700">
          {loading ? '…' : fmt(count)}
        </span>
      )}
    </TabsTrigger>
  )
}

function Section<T>({
  title,
  hint,
  icon,
  group,
  rows,
  more,
  onRetry,
  skeletonRows = PREVIEW_SIZE
}: {
  title?: string
  hint?: string
  icon?: React.ReactNode
  group: Group<T>
  rows: React.ReactNode[]
  more?: React.ReactNode
  onRetry: () => void
  skeletonRows?: number
}) {
  return (
    <section aria-label={title}>
      {title && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span className="text-gray-500" aria-hidden>
              {icon}
            </span>
            {title}
            {!group.loading && !group.error && (
              <span className="font-normal text-gray-500">· {fmt(group.total)}</span>
            )}
          </h2>
          {hint && <p className="hidden text-xs text-gray-500 sm:block">{hint}</p>}
        </div>
      )}

      {group.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <span className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {group.error}
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : group.loading && group.rows.length === 0 ? (
        <ul className="divide-y rounded-lg border bg-white" aria-busy>
          {Array.from({ length: skeletonRows }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white px-4 py-6 text-center text-sm text-gray-500">
          No matches here.
        </p>
      ) : (
        <ul
          className={`divide-y overflow-hidden rounded-lg border bg-white transition-opacity ${
            group.loading ? 'opacity-60' : ''
          }`}
        >
          {rows}
        </ul>
      )}

      {!group.error && more}
    </section>
  )
}

function Initials({ name, tone }: { name: string; tone: 'yellow' | 'gray' }) {
  const [last, first] = name.split(',').map((s) => s.trim())
  const letters = `${first?.[0] ?? ''}${last?.[0] ?? ''}` || name[0]
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
        tone === 'yellow' ? 'bg-yellow-100 text-yellow-900' : 'bg-gray-100 text-gray-700'
      }`}
      aria-hidden
    >
      {letters.toUpperCase()}
    </span>
  )
}

function CensusResult({
  row,
  tokens,
  onOpen
}: {
  row: CensusRow
  tokens: string[]
  onOpen: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-yellow-50 focus-visible:bg-yellow-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
      >
        <Initials name={row.fullname} tone="yellow" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-gray-900">
            <Highlight text={row.fullname} tokens={tokens} />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {address(row)}
            </span>
            <span className="text-gray-400" aria-hidden>
              ·
            </span>
            <span>{ROLE[row.person_type]}</span>
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-blue-700 opacity-80 group-hover:opacity-100 sm:inline-flex">
          View household <ChevronRight className="size-4" aria-hidden />
        </span>
        <ChevronRight className="size-5 shrink-0 text-gray-400 sm:hidden" aria-hidden />
      </button>
    </li>
  )
}

function ListResult({
  row,
  tokens,
  onOpen
}: {
  row: ListRow
  tokens: string[]
  onOpen: () => void
}) {
  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <Initials name={row.fullname} tone="gray" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-900">
          <Highlight text={row.fullname} tokens={tokens} />
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {address(row) || 'No address'}
          </span>
          {row.sources.map((s) => (
            <span key={s} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-px text-xs text-gray-700">
              {s}
            </span>
          ))}
          {row.details.length > 0 && (
            <span className="text-xs text-gray-500">{row.details.join(' · ')}</span>
          )}
        </p>
      </div>
      {row.household_id ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpen}
          className="ml-12 h-11 border-green-300 sm:h-9 bg-green-50 text-green-800 hover:bg-green-100 sm:ml-0"
        >
          <Home className="size-4" aria-hidden /> In census · View household
        </Button>
      ) : (
        <span className="ml-12 text-xs font-medium text-gray-500 sm:ml-0">Not in census</span>
      )}
    </li>
  )
}

function SeeAll({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      See all {fmt(n)} {label} <ArrowRight className="size-4" aria-hidden />
    </button>
  )
}

function Pager({
  page,
  total,
  loading,
  onPage
}: {
  page: number
  total: number
  loading: boolean
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total <= PAGE_SIZE) return null
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  return (
    <nav className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-600" aria-label="Pages">
      <span className="tabular-nums">
        {fmt(from)}–{fmt(to)} of {fmt(total)}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          disabled={page === 0 || loading}
          onClick={() => {
            onPage(page - 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Button>
        <span className="hidden tabular-nums sm:inline">
          Page {fmt(page + 1)} of {fmt(pages)}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-11 sm:h-9"
          disabled={page + 1 >= pages || loading}
          onClick={() => {
            onPage(page + 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}

function NoResults({
  q,
  scope,
  canClearBrgy,
  canSearchAll,
  onClearBrgy,
  onSearchAll,
  onClearSearch
}: {
  q: string
  scope: string
  canClearBrgy: boolean
  canSearchAll: boolean
  onClearBrgy: () => void
  onSearchAll: () => void
  onClearSearch: () => void
}) {
  return (
    <div className="mt-6 rounded-xl border border-dashed bg-white px-6 py-10 text-center">
      <SearchX className="mx-auto size-10 text-gray-400" aria-hidden />
      <h2 className="mt-3 text-base font-semibold text-gray-900">
        {q ? `No AP members found for “${q}”` : 'No AP members here yet'}
      </h2>
      <p className="mt-1 text-sm text-gray-600">Searched {scope}.</p>
      {q && (
        <ul className="mx-auto mt-4 max-w-sm space-y-1 text-left text-sm text-gray-600">
          <li>• Check the spelling, or try the last name only.</li>
          <li>• Leave out middle names and suffixes (Jr., Sr.).</li>
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {canClearBrgy && (
          <Button variant="outline" onClick={onClearBrgy}>
            Search all barangays
          </Button>
        )}
        {canSearchAll && (
          <Button variant="outline" onClick={onSearchAll}>
            Search all municipalities
          </Button>
        )}
        {q && (
          <Button variant="ghost" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
      </div>
    </div>
  )
}
