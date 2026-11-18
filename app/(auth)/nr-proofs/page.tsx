'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { isOwner, MUNICIPALITIES } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { Check, ExternalLink, FileCheck2, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Status = 'pending' | 'approved' | 'rejected' | 'all'

type Proof = {
  id: number
  person_type: 'husband' | 'wife' | 'member'
  family_id: number
  member_id: number | null
  fullname: string
  household_id: number | null
  location_id: number | null
  municipality: string
  barangay: string | null
  status: 'pending' | 'approved' | 'rejected'
  submitted_by: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  photo_url: string | null
}

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  all: 'All'
}
const ROLE_LABELS = { husband: 'Husband', wife: 'Wife', member: 'Family member' }
const ALL = 'ALL'

async function api(path: string, init?: RequestInit) {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : ''

/**
 * Review the Voter's Certificates uploaded for NR people on the household
 * cards. Owner: every municipality. Province admin and super admin: their own.
 */
export default function NrProofsPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const owner = isOwner(user?.email)
  const allowed =
    owner || user?.type === 'province admin' || user?.type === 'super admin'

  const [status, setStatus] = useState<Status>('pending')
  const [town, setTown] = useState(ALL)
  const [barangay, setBarangay] = useState(ALL)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{
    items: Proof[]
    total: number
    pageSize: number
    lockedMunicipality: string | null
    pendingByBarangay: Record<string, number>
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [zoom, setZoom] = useState<Proof | null>(null)

  useEffect(() => {
    if (user && !allowed) router.replace('/')
  }, [user, allowed, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ status, page: String(page) })
      if (town !== ALL) p.set('municipality', town)
      if (barangay !== ALL) p.set('barangay', barangay)
      setData(await api(`/api/nr-proofs?${p}`))
    } catch (e) {
      toast.error(`Could not load the proofs: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [status, town, barangay, page])

  useEffect(() => {
    if (allowed) void load()
  }, [allowed, load])

  const decide = async (proof: Proof, decision: 'approve' | 'reject') => {
    let note: string | null = null
    if (decision === 'reject') {
      note = window.prompt(
        `Reject the proof of ${proof.fullname}? Add a reason for the encoder (optional):`,
        ''
      )
      if (note === null) return
    }
    setSaving(proof.id)
    try {
      const body = await api('/api/nr-proofs', {
        method: 'PATCH',
        body: JSON.stringify({ id: proof.id, decision, note })
      })
      toast.success(
        decision === 'approve'
          ? `${proof.fullname} is now registered (from NR).`
          : `Proof of ${proof.fullname} rejected.`
      )
      setZoom(null)
      setData((d) =>
        d
          ? {
              ...d,
              // On the "Waiting" list a decided proof leaves the list.
              items:
                status === 'pending'
                  ? d.items.filter((i) => i.id !== proof.id)
                  : d.items.map((i) => (i.id === proof.id ? { ...i, ...body.proof } : i)),
              total: status === 'pending' ? d.total - 1 : d.total,
              pendingByBarangay: {
                ...d.pendingByBarangay,
                [proof.barangay ?? '—']: Math.max(
                  0,
                  (d.pendingByBarangay[proof.barangay ?? '—'] ?? 1) - 1
                )
              }
            }
          : d
      )
    } catch (e) {
      toast.error((e as Error).message)
      void load()
    } finally {
      setSaving(null)
    }
  }

  if (!user || !allowed) return null

  const locked = data?.lockedMunicipality ?? null
  const pendingTotal = Object.values(data?.pendingByBarangay ?? {}).reduce((a, b) => a + b, 0)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const barangays = Object.entries(data?.pendingByBarangay ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
      <header className="mb-5 flex items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-600 text-white shadow-sm"
          aria-hidden
        >
          <FileCheck2 className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">NR Proofs</h1>
          <p className="text-sm text-gray-600">
            Voter&apos;s Certificates uploaded for not-registered people. Approving
            one marks the person registered (from NR,{' '}
            <span className="rounded bg-teal-600 px-1 text-[10px] font-semibold text-white">
              R*
            </span>
            ).
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border bg-white p-0.5">
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStatus(s)
                setPage(0)
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${
                status === s ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {STATUS_LABELS[s]}
              {s === 'pending' && pendingTotal > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs text-white">
                  {pendingTotal}
                </span>
              )}
            </button>
          ))}
        </div>

        {owner && !locked ? (
          <Select
            value={town}
            onValueChange={(v) => {
              setTown(v)
              setBarangay(ALL)
              setPage(0)
            }}
          >
            <SelectTrigger className="h-9 w-56 bg-white" aria-label="Municipality">
              <SelectValue />
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
          locked && <span className="text-sm font-medium text-gray-700">{locked}</span>
        )}

        <Select
          value={barangay}
          onValueChange={(v) => {
            setBarangay(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="h-9 w-56 bg-white" aria-label="Barangay">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All barangays</SelectItem>
            {barangay !== ALL && !barangays.some(([b]) => b === barangay) && (
              <SelectItem value={barangay}>{barangay}</SelectItem>
            )}
            {barangays.map(([b, n]) => (
              <SelectItem key={b} value={b}>
                {b} ({n} waiting)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-lg" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-gray-500">
          {status === 'pending' ? 'No proofs waiting for approval.' : 'No proofs here.'}
        </p>
      ) : (
        <div
          className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
        >
          {data?.items.map((p) => (
            <article key={p.id} className="flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setZoom(p)}
                className="block h-52 bg-gray-100"
                title="View larger"
              >
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt={`Voter's Certificate of ${p.fullname}`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-500">Photo missing</span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900">{p.fullname}</p>
                  <StatusPill status={p.status} />
                </div>
                <p className="text-xs text-gray-600">
                  {ROLE_LABELS[p.person_type]} · {p.barangay}, {p.municipality}
                </p>
                {p.location_id && (
                  <Link
                    href={`/households/${p.location_id}`}
                    className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
                  >
                    Open barangay households <ExternalLink className="size-3" />
                  </Link>
                )}
                <p className="text-xs text-gray-500">
                  Sent by {p.submitted_by} · {when(p.submitted_at)}
                </p>
                {p.reviewed_by && (
                  <p className="text-xs text-gray-500">
                    {p.status === 'approved' ? 'Approved' : 'Rejected'} by {p.reviewed_by} ·{' '}
                    {when(p.reviewed_at)}
                    {p.review_note && <> — “{p.review_note}”</>}
                  </p>
                )}
                {p.status === 'pending' && (
                  <div className="mt-auto flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-teal-600 hover:bg-teal-700"
                      disabled={saving === p.id}
                      onClick={() => void decide(p, 'approve')}
                    >
                      {saving === p.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-red-700"
                      disabled={saving === p.id}
                      onClick={() => void decide(p, 'reject')}
                    >
                      <X className="size-4" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {data && pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Larger view */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-label={`Voter's Certificate of ${zoom.fullname}`}
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-white" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">
              {zoom.fullname} <span className="font-normal text-white/70">· {zoom.barangay}, {zoom.municipality}</span>
            </p>
            <div className="flex gap-2">
              {zoom.status === 'pending' && (
                <>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={saving === zoom.id} onClick={() => void decide(zoom, 'approve')}>
                    <Check className="size-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-700" disabled={saving === zoom.id} onClick={() => void decide(zoom, 'reject')}>
                    <X className="size-4" /> Reject
                  </Button>
                </>
              )}
              <Button size="sm" variant="secondary" onClick={() => setZoom(null)}>
                Close
              </Button>
            </div>
          </div>
          {zoom.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoom.photo_url}
              alt={`Voter's Certificate of ${zoom.fullname}`}
              className="min-h-0 flex-1 object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: Proof['status'] }) {
  const cls =
    status === 'approved'
      ? 'bg-teal-100 text-teal-800'
      : status === 'rejected'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status === 'pending' ? 'Waiting' : status === 'approved' ? 'Approved' : 'Rejected'}
    </span>
  )
}
