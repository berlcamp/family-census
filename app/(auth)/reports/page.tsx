'use client'

import OwnerMark from '@/components/OwnerMark'
import { Button } from '@/components/ui/button'
import { isOwner } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import {
  ApSummaryRow,
  byMunicipality,
  CountKey,
  downloadApSummaryExcel,
  normalizeRows,
  pct,
  REPORT_COLUMNS,
  REPORT_NOTE,
  sumRows
} from '@/lib/reports/apSummary'
import { supabase } from '@/lib/supabase/client'
import { ChevronDown, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

const fmt = (n: number) => new Intl.NumberFormat().format(n)
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

/** Owner-only reports. First report: AP family summary. */
export default function ReportsPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const allowed = isOwner(user?.email)

  const [rows, setRows] = useState<ApSummaryRow[]>([])
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (user && !allowed) router.replace('/')
  }, [user, allowed, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      const res = await fetch('/api/reports/ap-summary', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` }
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      setRows(normalizeRows(body.rows ?? []))
      setGeneratedAt(new Date(body.generatedAt))
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const groups = useMemo(() => byMunicipality(rows), [rows])
  const grand = useMemo(() => sumRows(rows), [rows])

  const toggle = (m: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(m)) next.delete(m)
      else next.add(m)
      return next
    })

  if (!allowed) return null

  const cells = (v: Record<CountKey, number>) =>
    REPORT_COLUMNS.map((c) => (
      <td key={c.key} className="px-3 py-1.5 text-right tabular-nums">
        {c.key === 'pct' ? fmtPct(pct(v.families_with_ap, v.families)) : fmt(v[c.key])}
      </td>
    ))

  return (
    <div className="space-y-4 p-4 pt-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
            Reports <OwnerMark />
          </h1>
          <p className="text-sm text-gray-500">
            AP family summary by municipality and barangay
            {generatedAt &&
              ` · as of ${generatedAt.toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}`}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <Button
          variant="blue"
          disabled={loading || rows.length === 0}
          onClick={() => {
            try {
              downloadApSummaryExcel(rows, generatedAt ?? new Date())
            } catch (e) {
              toast.error(`Could not build the Excel file: ${(e as Error).message}`)
            }
          }}
        >
          <Download className="h-4 w-4" /> Download Excel
        </Button>
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Households', fmt(grand.households)],
            ['Families', fmt(grand.families)],
            ['Families with AP', `${fmt(grand.families_with_ap)} · ${fmtPct(pct(grand.families_with_ap, grand.families))}`],
            ['Pending review', fmt(grand.families_pending_review)]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="text-xs font-medium text-gray-500">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold">AP family summary</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {REPORT_NOTE} Click a municipality to see its barangays.
          </p>
        </div>

        {error ? (
          <p className="p-4 text-sm text-red-600">{error}</p>
        ) : loading ? (
          <div className="space-y-2 p-4">
            <p className="text-xs text-gray-500">Loading report… this takes a few seconds.</p>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Municipality / Barangay</th>
                  {REPORT_COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = open.has(g.municipality)
                  return (
                    <Fragment key={g.municipality}>
                      <tr
                        className="cursor-pointer border-t font-medium hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                        onClick={() => toggle(g.municipality)}
                      >
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="inline-flex items-center gap-1">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {g.municipality}
                            <span className="text-xs font-normal text-gray-400">
                              ({g.barangays.length})
                            </span>
                          </span>
                        </td>
                        {cells(g.totals)}
                      </tr>
                      {isOpen &&
                        g.barangays.map((b) => (
                          <tr
                            key={`${g.municipality}-${b.barangay}`}
                            className="border-t bg-gray-50/60 text-gray-700 dark:border-gray-800 dark:bg-gray-800/30 dark:text-gray-300"
                          >
                            <td className="whitespace-nowrap py-1 pl-10 pr-3">{b.barangay}</td>
                            {cells(b)}
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold dark:bg-gray-800">
                <tr className="border-t-2 dark:border-gray-700">
                  <td className="px-3 py-2">TOTAL</td>
                  {cells(grand)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
