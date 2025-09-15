/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { supabase } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import MemberModal from './MemberModal'
import VoterModal from './VoterModal'

const PER_PAGE = 10

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''

  const [selectedVoter, setSelectedVoter] = useState<any | null>(null)
  const [selectedMember, setSelectedMember] = useState<any | null>(null)

  const [asensoResults, setAsensoResults] = useState<any[]>([])
  const [voterResults, setVoterResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchResults = async () => {
      setAsensoResults([])
      setVoterResults([])

      if (!query.trim()) return
      setLoading(true)

      // 1️⃣ Fetch from Asenso RPC
      const { data: asensoData, error: asensoError } = await supabase.rpc(
        'search_existing_members',
        {
          p_query: query,
          p_limit: PER_PAGE,
          p_offset: 0
        }
      )
      if (asensoError) console.error('Asenso search error:', asensoError)
      else setAsensoResults(asensoData ?? [])

      // 2️⃣ Fetch from Registered Voters
      const { data: voterData, error } = await supabase.rpc(
        'search_similar_voter_ids',
        {
          search: query,
          orgid: process.env.NEXT_PUBLIC_ORG_ID
        }
      )

      if (error) {
        console.error('Voter search RPC error:', error)
        setLoading(false)
        return
      } else {
        setVoterResults(voterData ?? [])
      }

      setLoading(false)
    }

    fetchResults()
  }, [query])

  return (
    <div className="w-full p-6">
      <h1 className="text-xl font-semibold mb-6">
        Search results for: <span className="text-blue-600">{query}</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left column: Asenso Pinoy */}
        <div>
          <h2 className="text-lg font-bold mb-4">Results from ADB</h2>
          {loading && <p>Loading results...</p>}
          {asensoResults.length === 0 && !loading ? (
            <p className="text-muted-foreground">No results found.</p>
          ) : (
            <div className="space-y-6">
              {asensoResults.map((item) => (
                <div
                  key={`asenso-${item.id}`}
                  className="group cursor-pointer"
                  onClick={() => setSelectedMember(item)}
                >
                  <div className="text-lg font-medium text-blue-600 group-hover:underline">
                    {item.firstname} {item.middlename} {item.lastname}{' '}
                    {item.fullname}
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">
                    Result from ADB
                  </div>
                  <div className="text-muted-foreground text-sm mt-1">
                    {item.barangay}
                    {', '}
                    {item.municipality && <span>{item.municipality}, </span>}
                    Misamis Occidental
                  </div>
                  <div className="text-muted-foreground text-sm mt-1">
                    Birthday: {item.birthday}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Registered Voters */}
        <div>
          <h2 className="text-lg font-bold mb-4">
            Results from Registered Voters
          </h2>
          {loading && <p>Loading results...</p>}
          {voterResults.length === 0 && !loading ? (
            <p className="text-muted-foreground">No results found.</p>
          ) : (
            <div className="space-y-6">
              {voterResults.map((item) => (
                <div
                  key={`voter-${item.id}`}
                  className="group cursor-pointer"
                  onClick={() => setSelectedVoter(item)}
                >
                  <div className="text-lg font-medium text-blue-600 group-hover:underline">
                    {item.fullname}
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">
                    Result from Registered Voters
                  </div>
                  <div className="text-muted-foreground text-sm mt-1">
                    {item.barangay && <span>{item.barangay}, </span>}
                    {item.address && <span>{item.address}, </span>}
                    MISAMIS OCCIDENTAL
                  </div>
                  {item.birthday && (
                    <div className="text-muted-foreground text-sm mt-1">
                      Birthday: {item.birthday}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Modal component */}
      <VoterModal
        voter={selectedVoter}
        onClose={() => setSelectedVoter(null)}
      />
      <MemberModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </div>
  )
}
