'use client'

import { PersonLine } from '@/app/(auth)/households/[locationid]/FamilyEditor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { isOwner, MUNICIPALITIES } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Loader2, Search, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'

const ALL = '__all__'
const fmt = (n: number) => new Intl.NumberFormat().format(n)

type Row = {
  person_type: 'husband' | 'wife' | 'member'
  person_id: number
  fullname: string
  barangay: string | null
  municipality: string | null
  household_id: number
}

type Person = {
  name: string
  registered: boolean
  asenso: boolean | null
  ap: boolean | null
}
type Household = {
  id: number
  name: string | null
  purok: string | null
  sitio: string | null
  barangay: string | null
  municipality: string | null
  service_provider: string | null
  families: {
    id: number
    all_nr: boolean
    husband: Person | null
    wife: Person | null
    members: (Person & { id: number })[]
  }[]
}

async function authFetch(url: string, signal?: AbortSignal) {
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

/** AP people in the census, for the owner and province admins. */
export default function ApMembersPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const owner = isOwner(user?.email)
  const allowed = owner || user?.type === 'province admin'

  // requested = picked by the owner; municipality = what the server returned
  // (the user's own municipality by default).
  const [requested, setRequested] = useState<string | null>(null)
  const [municipality, setMunicipality] = useState<string | null>(null)
  const [barangay, setBarangay] = useState(ALL)
  const [term, setTerm] = useState('')
  const [q] = useDebounce(term.trim(), 350)
  const [page, setPage] = useState(0)

  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [barangays, setBarangays] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openRow, setOpenRow] = useState<Row | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/')
  }, [user, allowed, router])

  // A new search goes back to the first page (the selects do it on change).
  const [lastQ, setLastQ] = useState(q)
  if (lastQ !== q) {
    setLastQ(q)
    setPage(0)
  }

  const request = useRef(0)
  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (requested) params.set('municipality', requested)
      if (barangay !== ALL) params.set('barangay', barangay)
      if (q) params.set('q', q)
      const body = await authFetch(`/api/ap-members?${params}`)
      if (id !== request.current) return
      setRows(body.rows ?? [])
      setTotal(body.total ?? 0)
      setPageSize(body.pageSize ?? 25)
      setBarangays(body.barangays ?? [])
      setMunicipality(body.municipality ?? null)
    } catch (e) {
      if (id === request.current) setError((e as Error).message)
    }
    if (id === request.current) setLoading(false)
  }, [requested, barangay, q, page])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  if (!user || !allowed) return null

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 pt-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">AP Members</h1>
        <p className="text-sm text-gray-500">
          AP people encoded in the census
          {municipality ? ` · ${municipality}` : ''}. Same AP rule as Reports.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {owner ? (
          <Select
            value={municipality ?? undefined}
            onValueChange={(v) => {
              setRequested(v)
              setMunicipality(v)
              setBarangay(ALL)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-full" aria-label="Municipality">
              <SelectValue placeholder="Municipality" />
            </SelectTrigger>
            <SelectContent>
              {MUNICIPALITIES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex h-9 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-700">
            {municipality ?? '…'}
          </div>
        )}
        <Select
          value={barangay}
          onValueChange={(v) => {
            setBarangay(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-full" aria-label="Barangay">
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search name…"
            className="pl-8"
            aria-label="Search name"
          />
        </div>
      </div>

      {error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Address</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className={loading ? 'opacity-50' : ''}>
            {rows.map((r) => (
              <tr
                key={`${r.person_type}-${r.person_id}`}
                className="border-t dark:border-gray-700"
              >
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {r.fullname}
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {[r.barangay, r.municipality].filter(Boolean).join(', ')}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => setOpenRow(r)}>
                    <Users className="size-4" /> View family
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                  No AP members found{q ? ` matching “${q}”` : ''}.
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {fmt(total)} AP member{total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            Page {page + 1} of {fmt(pages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages || loading}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <HouseholdModal row={openRow} onClose={() => setOpenRow(null)} />
    </div>
  )
}

function HouseholdModal({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!row) return
    const controller = new AbortController()
    setHousehold(null)
    setError(null)
    setLoading(true)
    authFetch(`/api/ap-members/household?id=${row.household_id}`, controller.signal)
      .then((body) => setHousehold(body.household))
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [row])

  // Highlight the person this modal was opened for.
  const isOpened = (type: Row['person_type'], id: number) =>
    !!row && row.person_type === type && row.person_id === id

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Household composition</DialogTitle>
          <DialogDescription>
            {row ? `${row.fullname} · ${[row.barangay, row.municipality].filter(Boolean).join(', ')}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-gray-400" />
          </div>
        )}
        {error && (
          <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        {household && (
          <Card className="gap-2 rounded-none border-gray-300 bg-yellow-100 py-3 text-gray-900">
            <CardHeader className="gap-0 px-3">
              <div className="text-xs leading-snug text-gray-500">
                <p className="font-medium text-gray-700">{household.name}</p>
                <p>Purok: {household.purok}</p>
                <p>SP: {household.service_provider ?? 'None'}</p>
                {household.sitio && <p>Sitio: {household.sitio}</p>}
              </div>
            </CardHeader>
            <CardContent className="px-3">
              {household.families.length === 0 && (
                <p className="text-sm text-gray-500">No families encoded.</p>
              )}
              {household.families.map((f) => (
                <div
                  key={f.id}
                  className={`mb-2 rounded px-2 py-1.5 ${
                    f.all_nr ? 'border border-red-300 bg-red-100' : 'bg-yellow-200/60'
                  }`}
                >
                  {f.husband && (
                    <PersonLine
                      className={`font-semibold ${isOpened('husband', f.id) ? 'underline decoration-blue-600 decoration-2' : ''}`}
                      name={f.husband.name}
                      registered={f.husband.registered}
                      ap={f.husband.ap}
                      asenso={f.husband.asenso}
                    />
                  )}
                  {f.wife && (
                    <PersonLine
                      className={`font-semibold ${isOpened('wife', f.id) ? 'underline decoration-blue-600 decoration-2' : ''}`}
                      name={f.wife.name}
                      registered={f.wife.registered}
                      ap={f.wife.ap}
                      asenso={f.wife.asenso}
                    />
                  )}
                  {f.members.length > 0 && (
                    <ul className="ml-4 list-disc text-sm text-gray-700">
                      {f.members.map((m) => (
                        <li key={m.id}>
                          <PersonLine
                            className={`font-semibold ${isOpened('member', m.id) ? 'underline decoration-blue-600 decoration-2' : ''}`}
                            name={m.name}
                            registered={m.registered}
                            ap={m.ap}
                            asenso={m.asenso}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  )
}
