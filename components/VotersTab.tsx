/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
'use client'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { PER_PAGE } from '@/lib/constants'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import {
  appendVoters,
  resetVoters,
  setVoters,
  setVotersPage
} from '@/lib/redux/listSlice'
import { supabase } from '@/lib/supabase/client'
import { Voter } from '@/types'
import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import VoterRemarks from './VoterRemarks'

interface Props {
  locationId: number
}

export function VotersTab({ locationId }: Props) {
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null)
  // const location = useAppSelector((state) => state.location.selectedLocation)

  const { voters, votersPage } = useAppSelector((state) => state.list)

  const dispatch = useAppDispatch()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBarangay, setSelectedBarangay] = useState('')
  const [barangays, setBarangays] = useState<string[]>([])

  // Display show more
  const [showMore, setShowMore] = useState(true)

  const fetchVoters = async (page: number, showmore: boolean = false) => {
    let query = supabase
      .from('voters')
      .select()
      .eq('location_id', locationId)
      .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)

    // If search term is provided
    if (searchTerm.trim()) {
      // Step 1: Use RPC to get top 10 IDs
      const { data: matchedIds, error: searchError } = await supabase.rpc(
        'search_similar_voter_ids',
        { search: searchTerm.trim() }
      )

      if (searchError) {
        console.error('Search RPC error:', searchError)
        return
      }

      const ids = matchedIds?.map((row: { id: any }) => row.id)

      if (!ids || ids.length === 0) {
        dispatch(setVoters([]))
        setShowMore(false)
        return
      }

      // Step 2: Filter using those IDs
      query = query.in('id', ids)
    }

    // Filter by barangay if selected
    if (selectedBarangay) {
      query = query.eq('barangay', selectedBarangay)
    }

    // Apply pagination and sorting
    query = query
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
      .order('barangay', { ascending: true })
      .order('fullname', { ascending: true })

    // Execute final query
    const { data, error } = await query

    if (error) {
      console.error('Error fetching voters:', error)
      return
    }

    if (data.length < PER_PAGE) {
      setShowMore(false)
    }

    if (showmore) {
      dispatch(appendVoters(data ?? []))
    } else {
      dispatch(setVoters(data ?? []))
    }

    dispatch(setVotersPage(page))
  }

  const fetchBarangays = async (locationId: number) => {
    const { data, error } = await supabase
      .from('barangays_per_location')
      .select('barangay')
      .eq('location_id', locationId)
      .order('barangay')

    if (error) {
      console.error('Failed to fetch barangays:', error)
      return []
    }

    // Deduplicate on client-side just in case
    const barangays = Array.from(new Set(data.map((v) => v.barangay))).sort()
    return barangays
  }

  // Reset and fetch on locationId change
  useEffect(() => {
    dispatch(resetVoters())
    void fetchVoters(1)
  }, [locationId])

  useEffect(() => {
    if (locationId) {
      fetchBarangays(locationId).then(setBarangays)
    }
  }, [locationId])

  const handleShowMore = () => {
    void fetchVoters(votersPage + 1, true)
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      dispatch(resetVoters())
      void fetchVoters(1)
    }, 300)

    return () => clearTimeout(timeout)
  }, [searchTerm, selectedBarangay])

  return (
    <div className="dark:bg-[#1f1f1f]">
      <div className="flex flex-wrap items-center gap-2 px-2 pt-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search voters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-2 py-1 rounded-md text-sm w-full sm:w-[220px]"
        />

        {/* Barangay Filter */}
        <select
          value={selectedBarangay}
          onChange={(e) => setSelectedBarangay(e.target.value)}
          className="border px-2 py-1 rounded-md text-sm w-full sm:w-[180px]"
        >
          <option value="">All Barangays</option>
          {/* Optional: Map from unique barangays if you load them */}
          {barangays.map((bgy) => (
            <option key={bgy} value={bgy}>
              {bgy}
            </option>
          ))}
        </select>
        {/* Reset filter */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setSearchTerm('')
            setSelectedBarangay('')
          }}
        >
          Reset Filter
        </Button>
      </div>

      <div className="text-sm border-gray-300 dark:border-gray-700">
        {voters.length === 0 ? (
          <p className="p-4 text-muted-foreground">No Voters found.</p>
        ) : (
          <>
            {/* Header */}
            <div className="mt-4 border-t grid grid-cols-[100px_1fr_1fr_1fr] font-semibold px-2 py-2 border-b dark:border-gray-700">
              <div>ID</div>
              <div>Fullname</div>
              <div>Category</div>
              <div>Address</div>
            </div>

            {/* Rows */}
            {voters.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[100px_1fr_1fr_1fr] px-2 py-2 border-b dark:border-gray-700 cursor-pointer hover:bg-muted/50 transition"
                onClick={async () => {
                  setSelectedVoter(item)
                }}
              >
                <div>{item.id}</div>
                <div>{item.fullname}</div>
                <div>{item.category}</div>
                <div>
                  {item.barangay}, {item.address}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {voters.length > 0 && showMore && (
        <div className="text-center mt-4">
          <Button onClick={handleShowMore} size="xs">
            Show more
          </Button>
        </div>
      )}

      <Sheet
        open={!!selectedVoter}
        onOpenChange={(open) => {
          if (!open) setSelectedVoter(null)
        }}
      >
        <SheetContent side="right" className="min-w-2/5 mt-13">
          <SheetHeader>
            <SheetTitle>Voter Details</SheetTitle>
            <SheetDescription>{/* Description */}</SheetDescription>
          </SheetHeader>
          {selectedVoter && (
            <div className="px-4 space-y-2 text-sm">
              <div>
                <strong>Name:</strong> {selectedVoter.fullname || 'N/A'}
              </div>
              <div>
                <strong>Address:</strong> {selectedVoter.barangay},{' '}
                {selectedVoter.address}
              </div>
              <div>
                <strong>Category:</strong> {selectedVoter.category}
              </div>

              <VoterRemarks voterId={selectedVoter.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
