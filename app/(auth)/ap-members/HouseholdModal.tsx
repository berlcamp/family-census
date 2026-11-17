'use client'

import { BadgeLegend, PersonLine } from '@/app/(auth)/households/[locationid]/FamilyEditor'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authFetch } from './authFetch'

type Person = { name: string; registered: boolean; asenso: boolean | null; ap: boolean | null }
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

export type HouseholdTarget = {
  householdId: number
  /** The person the modal was opened for (underlined), when known. */
  person?: { type: 'husband' | 'wife' | 'member'; id: number }
  name: string
  address: string
}

/** Read-only household composition, on the same yellow card as the households page. */
export default function HouseholdModal({
  target,
  onClose
}: {
  target: HouseholdTarget | null
  onClose: () => void
}) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!target) return
    const controller = new AbortController()
    setHousehold(null)
    setError(null)
    authFetch(`/api/ap-members/household?id=${target.householdId}`, controller.signal)
      .then((body) => setHousehold(body.household))
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message)
      })
    return () => controller.abort()
  }, [target])

  const mark = (type: 'husband' | 'wife' | 'member', id: number) =>
    target?.person?.type === type && target.person.id === id
      ? 'underline decoration-blue-600 decoration-2 underline-offset-2'
      : ''

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Household composition</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <span className="font-medium text-gray-700">{target?.name}</span>
            <span aria-hidden>·</span>
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span>{target?.address}</span>
          </DialogDescription>
        </DialogHeader>

        {!household && !error && (
          <div className="space-y-2 rounded-none border border-gray-300 bg-yellow-50 p-3" aria-busy>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-3 h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {household && (
          <>
            <Card className="gap-2 rounded-none border-gray-300 bg-yellow-100 py-3 text-gray-900">
              <CardHeader className="gap-0 px-3">
                <div className="text-xs leading-snug text-gray-600">
                  <p className="font-medium text-gray-800">{household.name}</p>
                  <p>Purok: {household.purok || '—'}</p>
                  <p>SP: {household.service_provider ?? 'None'}</p>
                  {household.sitio && <p>Sitio: {household.sitio}</p>}
                </div>
              </CardHeader>
              <CardContent className="px-3">
                {household.families.length === 0 && (
                  <p className="text-sm text-gray-600">No families encoded.</p>
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
                        className={`font-semibold ${mark('husband', f.id)}`}
                        name={f.husband.name}
                        registered={f.husband.registered}
                        ap={f.husband.ap}
                        asenso={f.husband.asenso}
                      />
                    )}
                    {f.wife && (
                      <PersonLine
                        className={`font-semibold ${mark('wife', f.id)}`}
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
                              className={`font-semibold ${mark('member', m.id)}`}
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
            <BadgeLegend apRestricted={false} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
