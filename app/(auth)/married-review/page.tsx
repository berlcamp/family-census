'use client'

import OwnerMark from '@/components/OwnerMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { isOwner } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { Check, Download, RefreshCw, Undo2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

type Status = 'pending' | 'confirmed' | 'rejected' | 'superseded'
type Decision = 'confirm' | 'reject' | 'undo'

interface Candidate {
  id: number
  match_id: number
  person_type: 'husband' | 'wife' | 'member'
  family_id: number
  household_id: number | null
  town: string
  barangay: string | null
  census_name: string
  voter_id: number
  voter_name: string
  voter_barangay: string | null
  voter_is_ap: boolean
  n_candidates: number
  status: Status
  reviewed_by: string | null
  reviewed_at: string | null
}

interface TownSummary {
  town: string
  people: number
  apVoter: number
  pending: number
  confirmed: number
  confirmedAp: number
  rejected: number
}

const STATUS_TABS: { key: Status | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' }
]

const fmt = (n: number) => new Intl.NumberFormat().format(n)

const SUMMARY_HEADERS = ['People', 'AP voter', 'Pending', 'Confirmed', 'Confirmed AP', 'Rejected']

const summaryValues = (t: Omit<TownSummary, 'town'>) => [
  t.people,
  t.apVoter,
  t.pending,
  t.confirmed,
  t.confirmedAp,
  t.rejected
]

/** One sheet: title, note, header, a row per municipality, TOTAL as SUM formulas. */
function downloadSummaryExcel(summary: TownSummary[], total: Omit<TownSummary, 'town'>) {
  const now = new Date()
  const generated = now.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  const aoa: (string | number)[][] = [
    ['Married-name Review — Summary per Municipality'],
    [
      'NR people whose voter record may still have their maiden name (middle name = voter last name). ' +
        `Counted per person. Generated ${generated}.`
    ],
    [],
    ['Municipality', ...SUMMARY_HEADERS],
    ...summary.map((t) => [t.town, ...summaryValues(t)]),
    ['TOTAL', ...summaryValues(total)]
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const headerRow = 4
  const firstData = headerRow + 1
  const lastData = headerRow + summary.length
  const totalRow = lastData + 1
  SUMMARY_HEADERS.forEach((_, i) => {
    const col = XLSX.utils.encode_col(i + 1)
    for (let r = firstData; r <= totalRow; r++) {
      const cell = ws[`${col}${r}`]
      if (!cell) continue
      cell.z = '#,##0'
      if (r === totalRow && summary.length > 0) cell.f = `SUM(${col}${firstData}:${col}${lastData})`
    }
  })
  ws['!cols'] = [{ wch: 30 }, ...SUMMARY_HEADERS.map(() => ({ wch: 13 }))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  XLSX.writeFile(wb, `married-name-review-summary-${now.toISOString().slice(0, 10)}.xlsx`)
}

/**
 * One summary row per town, counted per person (a person can have more than
 * one candidate voter). A person is confirmed if any candidate is confirmed,
 * pending if any is still pending, otherwise rejected.
 */
function summarize(rows: Candidate[]): TownSummary[] {
  const people = new Map<number, { town: string; rows: Candidate[] }>()
  for (const r of rows) {
    const p = people.get(r.match_id) ?? { town: r.town, rows: [] }
    p.rows.push(r)
    people.set(r.match_id, p)
  }
  const towns = new Map<string, TownSummary>()
  for (const p of people.values()) {
    const t = towns.get(p.town) ?? {
      town: p.town,
      people: 0,
      apVoter: 0,
      pending: 0,
      confirmed: 0,
      confirmedAp: 0,
      rejected: 0
    }
    t.people++
    if (p.rows.some((r) => r.voter_is_ap)) t.apVoter++
    const confirmed = p.rows.find((r) => r.status === 'confirmed')
    if (confirmed) {
      t.confirmed++
      if (confirmed.voter_is_ap) t.confirmedAp++
    } else if (p.rows.some((r) => r.status === 'pending')) t.pending++
    else t.rejected++
    towns.set(p.town, t)
  }
  return [...towns.values()].sort((a, b) => b.people - a.people || a.town.localeCompare(b.town))
}

/** "CRUZ, MARIA SANTOS" -> last name and the rest, for side-by-side display. */
function splitName(name: string) {
  const i = name.indexOf(',')
  return i < 0 ? { last: name, rest: '' } : { last: name.slice(0, i), rest: name.slice(i + 1).trim() }
}

/** Census name with its middle name highlighted, voter name with its last name highlighted. */
function CensusName({ name }: { name: string }) {
  const { last, rest } = splitName(name)
  const j = rest.lastIndexOf(' ')
  if (j < 0) return <span>{name}</span>
  return (
    <span>
      {last}, {rest.slice(0, j)}{' '}
      <mark className="rounded bg-amber-100 px-0.5 dark:bg-amber-900/50 dark:text-amber-100">
        {rest.slice(j + 1)}
      </mark>
    </span>
  )
}

function VoterName({ name }: { name: string }) {
  const { last, rest } = splitName(name)
  return (
    <span>
      <mark className="rounded bg-amber-100 px-0.5 dark:bg-amber-900/50 dark:text-amber-100">{last}</mark>
      {rest && `, ${rest}`}
    </span>
  )
}

/** Owner-only review of NR people whose voter record may have their maiden name. */
export default function MarriedReviewPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const allowed = isOwner(user?.email)

  const [rows, setRows] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [town, setTown] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<number | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/')
  }, [user, allowed, router])

  const authHeader = async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/married-review', { headers: await authHeader() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      setRows(body.rows ?? [])
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const decide = async (row: Candidate, decision: Decision) => {
    setBusy(row.id)
    try {
      const res = await fetch('/api/married-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ id: row.id, decision })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      setRows(body.rows ?? [])
      toast.success(
        decision === 'confirm'
          ? `Linked ${row.census_name} to the voter${row.voter_is_ap && row.town === 'OZAMIZ CITY' ? ' (AP)' : ''}`
          : decision === 'reject'
            ? 'Rejected'
            : 'Undone'
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
    setBusy(null)
  }

  const summary = useMemo(() => summarize(rows), [rows])
  const total = useMemo(
    () =>
      summary.reduce(
        (s, t) => ({
          people: s.people + t.people,
          apVoter: s.apVoter + t.apVoter,
          pending: s.pending + t.pending,
          confirmed: s.confirmed + t.confirmed,
          confirmedAp: s.confirmedAp + t.confirmedAp,
          rejected: s.rejected + t.rejected
        }),
        { people: 0, apVoter: 0, pending: 0, confirmed: 0, confirmedAp: 0, rejected: 0 }
      ),
    [summary]
  )

  const list = useMemo(() => {
    const q = search.trim().toUpperCase()
    return rows.filter(
      (r) =>
        (!town || r.town === town) &&
        (status === 'all' ? r.status !== 'superseded' : r.status === status) &&
        (!q ||
          r.census_name.toUpperCase().includes(q) ||
          r.voter_name.toUpperCase().includes(q) ||
          (r.barangay ?? '').toUpperCase().includes(q))
    )
  }, [rows, town, status, search])

  if (!allowed) return null

  const summaryCells = (t: Omit<TownSummary, 'town'>) =>
    summaryValues(t).map((n, i) => (
      <td key={i} className="px-3 py-1.5 text-right tabular-nums">
        {fmt(n)}
      </td>
    ))

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
            Married-name Review <OwnerMark />
          </h1>
          <p className="text-sm text-gray-500">
            NR people whose voter record may still have their maiden name: same first name, and
            their middle name is the voter&apos;s last name. Confirm links them to the voter, so they
            count as registered (and as AP in Ozamiz when the voter is AP).
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <Button
          variant="blue"
          disabled={loading || summary.length === 0}
          onClick={() => {
            try {
              downloadSummaryExcel(summary, total)
            } catch (e) {
              toast.error(`Could not build the Excel file: ${(e as Error).message}`)
            }
          }}
        >
          <Download className="h-4 w-4" /> Download Excel
        </Button>
      </div>

      <section className="rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold">Summary per municipality</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Counted per person. Click a municipality to review its list.
          </p>
        </div>
        {error ? (
          <p className="p-4 text-sm text-red-600">{error}</p>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            No candidates yet. Run STEP 1 of supabase/married_name_review.sql.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Municipality</th>
                  {SUMMARY_HEADERS.map((h) => (
                    <th key={h} className="px-3 py-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((t) => (
                  <tr
                    key={t.town}
                    onClick={() => setTown(town === t.town ? null : t.town)}
                    className={`cursor-pointer border-t hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60 ${
                      town === t.town ? 'bg-blue-50 font-medium dark:bg-blue-950/40' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">{t.town}</td>
                    {summaryCells(t)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold dark:bg-gray-800">
                <tr className="border-t-2 dark:border-gray-700">
                  <td className="px-3 py-2">TOTAL</td>
                  {summaryCells(total)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {!loading && !error && rows.length > 0 && (
        <section className="rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 dark:border-gray-700">
            <Select value={town ?? 'all'} onValueChange={(v) => setTown(v === 'all' ? null : v)}>
              <SelectTrigger className="h-8 w-full sm:w-60">
                <SelectValue placeholder="Municipality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All municipalities</SelectItem>
                {[...summary]
                  .sort((a, b) => a.town.localeCompare(b.town))
                  .map((t) => (
                    <SelectItem key={t.town} value={t.town}>
                      {t.town} ({fmt(t.people)})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <span className="mr-2 text-sm text-gray-500">{fmt(list.length)} shown</span>
            <div className="flex gap-1">
              {STATUS_TABS.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant={status === s.key ? 'default' : 'outline'}
                  onClick={() => setStatus(s.key)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or barangay"
              className="ml-auto h-8 w-full sm:w-64"
            />
          </div>

          {list.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Nothing here.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Census (NR)</th>
                    <th className="px-3 py-2 text-left font-medium">Voter record</th>
                    <th className="px-3 py-2 text-left font-medium">AP</th>
                    <th className="px-3 py-2 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t align-top dark:border-gray-800">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          <CensusName name={r.census_name} />
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.person_type} · {r.barangay ?? '—'}
                          {!town && ` · ${r.town}`}
                          {r.n_candidates > 1 && (
                            <span className="ml-1 text-amber-600">· {r.n_candidates} possible voters</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          <VoterName name={r.voter_name} />
                        </div>
                        <div className="text-xs text-gray-500">
                          {r.voter_barangay ?? '—'}
                          {r.voter_barangay &&
                            r.barangay &&
                            r.voter_barangay.toUpperCase() !== r.barangay.toUpperCase() && (
                              <span className="ml-1 text-amber-600">· different barangay</span>
                            )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.voter_is_ap ? (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/50 dark:text-green-200">
                            AP
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {r.status === 'pending' ? (
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="green"
                              disabled={busy !== null}
                              onClick={() => decide(r, 'confirm')}
                            >
                              <Check className="h-4 w-4" /> Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() => decide(r, 'reject')}
                            >
                              <X className="h-4 w-4" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-500">
                              {r.status}
                              {r.reviewed_by && ` by ${r.reviewed_by.split('@')[0]}`}
                            </span>
                            {(r.status === 'confirmed' || r.status === 'rejected') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy !== null}
                                onClick={() => decide(r, 'undo')}
                              >
                                <Undo2 className="h-4 w-4" /> Undo
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
