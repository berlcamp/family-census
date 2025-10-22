'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { Family, FamilyMember, Household } from '@/types'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''

  const [households, setHouseholds] = useState<Household[]>([])
  const [loading, setLoading] = useState(false)

  const user = useAppSelector((state) => state.user.user)

  useEffect(() => {
    if (!query.trim()) return

    const runSearch = async () => {
      setLoading(true)
      const { data, error } = await supabase.rpc('search_households_similar', {
        query
      })
      if (!error && data) setHouseholds(data)
      setLoading(false)
    }

    runSearch()
  }, [query])

  if (user?.type === 'user') {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-semibold mb-4 text-gray-800">
          Search access denied
        </h1>
      </div>
    )
  }

  if (!query)
    return (
      <div className="p-4 text-gray-500">
        Type something in the search bar above to start searching.
      </div>
    )

  if (loading)
    return <div className="p-4 text-gray-500">Searching for “{query}”...</div>

  if (households.length === 0)
    return (
      <div className="p-4 text-xl text-gray-600">
        No households found matching “{query}”.
      </div>
    )

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4 text-gray-800">
        Search Results for “{query}”
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {households.map((h) => (
          <Card
            key={`household-${h.id}`}
            className="rounded-none border-gray-300 bg-yellow-100"
          >
            <CardHeader>
              <CardTitle className="flex justify-between">
                {/* <span>{h.name}</span> */}
              </CardTitle>
              <p className="text-sm text-gray-500">
                Address: {h.purok}, {h.barangay}, {h.address}
              </p>
              {h.sitio && (
                <p className="text-sm text-gray-500">Sitio: {h.sitio}</p>
              )}
            </CardHeader>

            <CardContent>
              {h.families?.map((f: Family) => (
                <div
                  key={`family-${f.id}-${h.id}`}
                  className={`mb-3 rounded p-2 ${
                    f.all_nr ? 'bg-red-100 border border-red-300' : ''
                  }`}
                >
                  <p className="font-semibold">
                    {f.husband_name}{' '}
                    {f.husband && !f.husband?.voter_id && '(NR)'}
                  </p>
                  <p className="font-semibold">
                    {f.wife_name} {f.wife && !f.wife?.voter_id && '(NR)'}
                  </p>
                  <ul className="ml-4 list-disc text-sm text-gray-700">
                    {f.family_members?.map((m: FamilyMember, i: number) => (
                      <li key={i}>
                        {m.fullname} {m.is_registered ? '' : '(NR)'}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
