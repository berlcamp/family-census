'use client'

import { Greeting } from '@/components/Greeting'
import { useAppSelector } from '@/lib/redux/hook'
import { ChevronRight, Home, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)
  const locations = useAppSelector((state) => state.locationsList.value)

  // Same page for every user type. Admins get every barangay of their current
  // municipality, other users the ones assigned to them (see AuthGuard).
  const isAdmin = user?.type === 'super admin' || user?.type === 'province admin'

  return (
    <div className="w-full">
      <div className="mt-20 grid gap-6">
        <div className="text-center">
          <Greeting name={user?.name ?? ''} />
        </div>
        {user && (
          <BarangayShortcuts
            // New municipality: start with an empty search box.
            key={user.address}
            isAdmin={isAdmin}
            locations={locations ?? []}
            isViewer={user.type === 'viewer'}
          />
        )}
      </div>
    </div>
  )
}

function BarangayShortcuts({
  locations,
  isAdmin,
  isViewer
}: {
  locations: { id: number; name: string; address: string; color: string }[]
  isAdmin: boolean
  isViewer: boolean
}) {
  const [filter, setFilter] = useState('')
  const sorted = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations]
  )
  const shown = filter.trim()
    ? sorted.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : sorted

  if (locations.length === 0) {
    return (
      <div className="mx-auto w-full max-w-xl rounded-lg border bg-white p-5 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        {isViewer ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              You can look up households with the search bar at the top.
            </p>
            <Link
              href="/search"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Search className="h-4 w-4" /> Go to search
            </Link>
          </>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {isAdmin
              ? 'No barangays found for this municipality.'
              : 'No barangay is assigned to you yet. Please ask your administrator to assign one.'}
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
            {isAdmin
              ? `Barangays of ${locations[0].address}`
              : `Your barangay${locations.length === 1 ? '' : 's'}`}
          </h2>
          <p className="text-sm text-gray-500">
            Click a barangay to view and manage its households.
          </p>
        </div>
        {locations.length > 8 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a barangay…"
            className="h-9 w-full rounded-md border px-3 text-sm sm:w-56 dark:border-gray-700 dark:bg-gray-900"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l) => (
          <Link
            key={l.id}
            href={`/households/${l.id}`}
            className="group flex items-center gap-3 rounded-lg border bg-white p-3 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: l.color || 'gray' }}
            >
              <Home className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-gray-900 dark:text-gray-50">
                {l.name}
              </span>
              <span className="block truncate text-xs text-gray-500">{l.address}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-blue-600" />
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No barangay matches “{filter}”.</p>
      )}
    </section>
  )
}
