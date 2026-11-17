'use client'

import OwnerMark from '@/components/OwnerMark'
import { Button } from '@/components/ui/button'
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
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

type SummaryRow = {
  town: string | null
  barangay: string | null
  to_review: number
  reviewed: number
}

type Candidate = {
  id: number
  fullname: string | null
  barangay: string | null
  address?: string | null
  municipality?: string | null
  is_ap?: boolean | null
  ap_revoked?: boolean | null
}

type Item = {
  id: number
  person_type: 'member' | 'husband' | 'wife'
  fullname: string | null
  linked_voter_id: number | null
  voter_match_status: string | null
  voter_match_reason: string | null
  voter_in_census_elsewhere: boolean | null
  em_match_status: string | null
  em_match_reason: string | null
  possible_duplicate: boolean | null
  review_decision: 'accept' | 'reject' | null
  reviewed_by: string | null
  family_id: number | null
  family: { husband_name: string | null; wife_name: string | null } | null
  family_has_ap: boolean
  voter: Candidate | null
  existing_member: Candidate | null
  accept_gives_ap: boolean
}

type Decision = 'accept' | 'reject' | null

/**
 * A decision only moves the family report when it can make this family AP:
 * the family has no AP member yet and accepting would count as AP. (An Ozamiz
 * voter who is not AP stays not AP whichever way it is decided.)
 */
const changesReport = (i: Item) => !i.family_has_ap && i.accept_gives_ap

async function api(path: string, init?: RequestInit) {
  const {
    data: { session }
  } = await supabase.auth.getSession()
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? response.statusText)
  return body
}

const STATUS_LABELS = {
  pending: 'Not yet reviewed',
  reviewed: 'Already reviewed',
  all: 'All'
} as const
type Status = keyof typeof STATUS_LABELS

export default function ApReviewPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()
  const allowed = isOwner(user?.email)

  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [town, setTown] = useState('')
  const [barangay, setBarangay] = useState('')
  const [status, setStatus] = useState<Status>('pending')
  const [hideNoEffect, setHideNoEffect] = useState(true)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!user) return
    if (!allowed) router.replace('/')
  }, [router, user, allowed])

  const loadSummary = useCallback(async () => {
    try {
      const body = await api('/api/ap-review')
      setSummary(body.summary)
    } catch (e) {
      toast.error(`Could not load the review queue: ${(e as Error).message}`)
    }
  }, [])

  useEffect(() => {
    if (allowed) loadSummary()
  }, [allowed, loadSummary])

  const towns = useMemo(() => {
    const map = new Map<string, { toReview: number; reviewed: number }>()
    for (const s of summary) {
      const t = s.town ?? ''
      const cur = map.get(t) ?? { toReview: 0, reviewed: 0 }
      cur.toReview += Number(s.to_review)
      cur.reviewed += Number(s.reviewed)
      map.set(t, cur)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [summary])

  const barangays = useMemo(
    () => summary.filter((s) => (s.town ?? '') === town),
    [summary, town]
  )

  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, s) => ({
          toReview: acc.toReview + Number(s.to_review),
          reviewed: acc.reviewed + Number(s.reviewed)
        }),
        { toReview: 0, reviewed: 0 }
      ),
    [summary]
  )

  const loadItems = useCallback(async () => {
    if (!town || !barangay) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        town,
        barangay,
        status
      })
      const body = await api(`/api/ap-review?${params}`)
      setItems(body.items)
    } catch (e) {
      toast.error(`Could not load names: ${(e as Error).message}`)
      setItems([])
    }
    setLoading(false)
  }, [town, barangay, status])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const visible = useMemo(
    () =>
      hideNoEffect
        ? items.filter((i) => i.review_decision !== null || changesReport(i))
        : items,
    [items, hideNoEffect]
  )
  const hiddenCount = items.length - visible.length

  const decide = async (ids: number[], decision: Decision) => {
    if (ids.length === 0) return
    setSaving((prev) => new Set([...prev, ...ids]))
    try {
      const body = await api('/api/ap-review', {
        method: 'POST',
        body: JSON.stringify({ ids, decision })
      })
      const updated = new Map<number, { review_decision: Decision; reviewed_by: string | null }>(
        body.updated.map((u: { id: number; review_decision: Decision; reviewed_by: string | null }) => [u.id, u])
      )
      setItems((prev) => {
        // An accepted match that makes the person AP also makes the family AP.
        const apFamilies = new Set<number>()
        for (const i of prev) {
          const u = updated.get(i.id)
          if (u?.review_decision === 'accept' && i.accept_gives_ap && i.family_id) {
            apFamilies.add(i.family_id)
          }
        }
        return prev.map((i) => {
          const u = updated.get(i.id)
          const next = u ? { ...i, review_decision: u.review_decision, reviewed_by: u.reviewed_by } : i
          return i.family_id && apFamilies.has(i.family_id)
            ? { ...next, family_has_ap: true }
            : next
        })
      })
      loadSummary()
    } catch (e) {
      toast.error(`Could not save: ${(e as Error).message}`)
    }
    setSaving((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  if (!allowed) return null

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          AP Match Review <OwnerMark />
        </h1>
        <p className="text-sm text-muted-foreground">
          Names the matcher was not sure about. Accept if the census person and
          the proposed record are the same person; reject if not. Decisions
          update the AP family summary right away.
        </p>
        <p className="text-sm mt-1">
          <span className="font-medium">{totals.reviewed.toLocaleString()}</span>{' '}
          of {totals.toReview.toLocaleString()} reviewed
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={town}
          onValueChange={(v) => {
            setTown(v)
            setBarangay('')
            setItems([])
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Municipality" />
          </SelectTrigger>
          <SelectContent>
            {towns.map(([t, c]) => (
              <SelectItem key={t} value={t}>
                {t} · {(c.toReview - c.reviewed).toLocaleString()} left
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={barangay} onValueChange={setBarangay} disabled={!town}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Barangay" />
          </SelectTrigger>
          <SelectContent>
            {barangays.map((b) => (
              <SelectItem key={b.barangay} value={b.barangay ?? ''}>
                {b.barangay} ·{' '}
                {(Number(b.to_review) - Number(b.reviewed)).toLocaleString()} left
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideNoEffect}
            onChange={(e) => setHideNoEffect(e.target.checked)}
          />
          Only names that change the report
        </label>
      </div>

      {town && barangay && (
        <div className="text-sm text-muted-foreground">
          {loading
            ? 'Loading…'
            : `${visible.length.toLocaleString()} shown${
                hiddenCount > 0
                  ? ` · ${hiddenCount.toLocaleString()} hidden (family already AP, or not AP either way)`
                  : ''
              }`}
        </div>
      )}

      <div className="space-y-2">
        {!loading &&
          visible.map((i) => (
            <ReviewCard
              key={i.id}
              item={i}
              saving={saving.has(i.id)}
              onDecide={(d) => decide([i.id], d)}
            />
          ))}
      </div>
    </div>
  )
}

function ReviewCard({
  item,
  saving,
  onDecide
}: {
  item: Item
  saving: boolean
  onDecide: (d: Decision) => void
}) {
  const role =
    item.person_type === 'member'
      ? 'Family member'
      : item.person_type === 'husband'
        ? 'Husband'
        : 'Wife'
  const emReview = item.em_match_status === 'review' && item.existing_member
  const voterReview = item.voter_match_status === 'review' && item.voter

  return (
    <div
      className={`border rounded-md p-3 text-sm grid gap-3 md:grid-cols-[1fr_1fr_auto] ${
        item.review_decision === 'accept'
          ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
          : item.review_decision === 'reject'
            ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
            : ''
      }`}
    >
      <div className="space-y-1">
        <div className="text-xs uppercase text-muted-foreground">Census · {role}</div>
        <div className="font-semibold">{item.fullname}</div>
        <div className="text-xs text-muted-foreground">
          {item.linked_voter_id ? 'Registered voter' : 'Encoded as non-registered'}
        </div>
        {item.family && (
          <div className="text-xs text-muted-foreground">
            Family: {item.family.husband_name || '—'} / {item.family.wife_name || '—'}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {item.family_has_ap && <Tag color="green">Family already AP</Tag>}
          {item.possible_duplicate && <Tag color="orange">Possible duplicate</Tag>}
        </div>
      </div>

      <div className="space-y-2">
        {emReview && (
          <CandidateBox
            title="AP members list"
            name={item.existing_member!.fullname}
            place={`${item.existing_member!.barangay ?? ''}, ${item.existing_member!.municipality ?? ''}`}
            reason={item.em_match_reason}
            extra={item.existing_member!.ap_revoked ? 'AP revoked' : null}
          />
        )}
        {voterReview && (
          <CandidateBox
            title="Voter list"
            name={item.voter!.fullname}
            place={`${item.voter!.barangay ?? ''}, ${item.voter!.address ?? ''}`}
            reason={item.voter_match_reason}
            extra={[
              item.voter!.is_ap && !item.voter!.ap_revoked ? 'Voter is AP' : 'Voter is not AP',
              item.voter_in_census_elsewhere ? 'already in another census family' : null
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        <div className="text-xs text-muted-foreground">
          If accepted: {item.accept_gives_ap ? 'counts as AP' : 'not AP'}
        </div>
      </div>

      <div className="flex md:flex-col gap-2 md:w-28">
        {item.review_decision ? (
          <>
            <div className="text-xs font-medium">
              {item.review_decision === 'accept' ? 'Accepted' : 'Rejected'}
            </div>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => onDecide(null)}>
              Undo
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={saving}
              onClick={() => onDecide('accept')}
            >
              Same person
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-600"
              disabled={saving}
              onClick={() => onDecide('reject')}
            >
              Not the same
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function CandidateBox({
  title,
  name,
  place,
  reason,
  extra
}: {
  title: string
  name: string | null
  place: string
  reason: string | null
  extra: string | null
}) {
  return (
    <div className="border rounded p-2">
      <div className="text-xs uppercase text-muted-foreground">Proposed match · {title}</div>
      <div className="font-semibold">{name}</div>
      <div className="text-xs">{place}</div>
      {reason && <div className="text-xs text-muted-foreground">{reason}</div>}
      {extra && <div className="text-xs font-medium">{extra}</div>}
    </div>
  )
}

function Tag({ color, children }: { color: 'green' | 'orange'; children: React.ReactNode }) {
  const cls =
    color === 'green'
      ? 'bg-green-100 text-green-700'
      : 'bg-orange-100 text-orange-700'
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{children}</span>
}
