/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useState } from 'react'

import LoadingSkeleton from '@/components/LoadingSkeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import VerticalMenu from '@/components/VerticalMenu'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import {
  addFamily,
  addHousehold,
  deleteFamily,
  deleteHousehold,
  selectPaginatedHouseholds,
  setHouseholds,
  setPage,
  updateFamily,
  updateHousehold
} from '@/lib/redux/householdsSlice'
import { clearLocation, setLocation } from '@/lib/redux/locationSlice'
import { supabase } from '@/lib/supabase/client'
import { Family, FamilyMember, Household } from '@/types'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import FamilyFormModal from './FamilyFormModal'
import HouseholdModal from './HouseholdModal'

export default function HouseholdsPage() {
  const { locationid } = useParams<{ locationid: string }>()
  const locationIdNum = Number(locationid)

  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const households = useAppSelector(selectPaginatedHouseholds)

  // Get pagination info from Redux
  const { currentPage, pageSize, totalCount } = useAppSelector(
    (state) => state.householdsList
  )

  const [search, setSearch] = useState('')

  const [showHouseholdModal, setShowHouseholdModal] = useState(false)
  const [editHousehold, setEditHousehold] = useState<Household | null>(null)

  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [currentHouseholdId, setCurrentHouseholdId] = useState<number | null>(
    null
  )
  const [editFamily, setEditFamily] = useState<Family | null>(null)

  const dispatch = useAppDispatch()
  const location = useAppSelector((state) => state.location.selectedLocation)
  const user = useAppSelector((state) => state.user.user)

  // Save Household
  const handleSaveHousehold = async (household: Partial<Household>) => {
    if (!location) return

    if (household.id) {
      // UPDATE existing household
      const { data, error } = await supabase
        .from('households')
        .update({
          name: household.name,
          purok: household.purok,
          sitio: household.sitio,
          barangay: location.name,
          address: location.address,
          location_id: locationIdNum
        })
        .eq('id', household.id)
        .select()
        .single()

      if (error) {
        toast.error('Error updating household')
        return
      }

      // Preserve existing families in Redux
      const existingFamilies =
        households.find((h) => h.id === household.id)?.families ?? []

      dispatch(
        updateHousehold({
          ...data,
          families: existingFamilies
        })
      )
    } else {
      // INSERT new household
      const { data, error } = await supabase
        .from('households')
        .insert([
          {
            name: household.name,
            purok: household.purok,
            sitio: household.sitio,
            barangay: location.name,
            address: location.address,
            location_id: locationIdNum
          }
        ])
        .select()
        .single()

      if (error) {
        toast.error('Error adding household')
        return
      }

      dispatch(
        addHousehold({
          ...data,
          families: []
        })
      )
    }

    toast.success('Household saved successfully!')
    setShowHouseholdModal(false)
  }

  // Save Family (Full Replace Strategy)
  const handleSaveFamily = async (family: Partial<Family>) => {
    if (!currentHouseholdId) return

    // 1. Husband or Wife must be set
    if (!family.husband?.voter_id && !family.wife?.voter_id) {
      toast.error('At least one of Husband or Wife must be a registered voter.')
      return
    }

    // 2. Check duplicates (husband/wife already part of another family)
    // ✅ Gather all voter_ids for this family (husband, wife, members)
    const voterIdsToCheck = [
      family.husband?.voter_id,
      family.wife?.voter_id,
      ...(family.family_members?.map((m) => m.voter_id) ?? [])
    ].filter(Boolean) // remove null/undefined

    if (voterIdsToCheck.length) {
      // Check against families table (husband_id, wife_id)
      const { data: existingFamilies, error: familiesErr } = await supabase
        .from('families')
        .select('id, husband_id, wife_id,barangay')
        .in('husband_id', voterIdsToCheck)
        .neq('id', family.id ?? 0)

      const { data: existingWives, error: wivesErr } = await supabase
        .from('families')
        .select('id, husband_id, wife_id,barangay')
        .in('wife_id', voterIdsToCheck)
        .neq('id', family.id ?? 0)

      // Check against family_members
      const { data: existingMembers, error: membersErr } = await supabase
        .from('family_members')
        .select('id, voter_id, family_id,barangay')
        .in('voter_id', voterIdsToCheck)
        .neq('family_id', family.id ?? 0)

      if (familiesErr || wivesErr || membersErr) {
        console.error(familiesErr || wivesErr || membersErr)
        toast.error('Error checking duplicates. Please try again.')
        return
      }

      // Combine results
      const conflicts = new Set([
        ...(existingFamilies?.map((f) => f.husband_id) ?? []),
        ...(existingWives?.map((f) => f.wife_id) ?? []),
        ...(existingMembers?.map((m) => m.voter_id) ?? [])
      ])

      // If any voter_id is in conflicts, stop saving
      const conflicted = voterIdsToCheck.find((id) => conflicts.has(id))
      if (conflicted) {
        // Build conflicts with barangay info
        const conflictsWithBarangay: Record<string, string> = {}

        existingFamilies?.forEach((f) => {
          if (f.husband_id) conflictsWithBarangay[f.husband_id] = f.barangay
        })
        existingWives?.forEach((f) => {
          if (f.wife_id) conflictsWithBarangay[f.wife_id] = f.barangay
        })
        existingMembers?.forEach((m) => {
          if (m.voter_id) conflictsWithBarangay[m.voter_id] = m.barangay
        })

        // ✅ Map voter_id → fullname
        const voterNameMap: Record<string, string> = {}

        if (family.husband?.voter_id) {
          voterNameMap[family.husband.voter_id] = family.husband.fullname
        }
        if (family.wife?.voter_id) {
          voterNameMap[family.wife.voter_id] = family.wife.fullname
        }
        for (const member of family.family_members ?? []) {
          if (member.voter_id) {
            voterNameMap[member.voter_id] = member.fullname
          }
        }
        const conflictedName =
          voterNameMap[conflicted] || `Voter ID ${conflicted}`
        const conflictedBarangay = conflictsWithBarangay[conflicted]

        toast.error(
          `${conflictedName} is already part of another family in ${conflictedBarangay}.`
        )
        return
      }
    }

    let familyId = family.id
    let savedFamily: Family | null = null

    // 3. Save Family (Insert or Update)
    if (family.id) {
      // UPDATE family
      const { error } = await supabase
        .from('families')
        .update({
          household_id: currentHouseholdId,
          husband_id: family.husband?.voter_id ?? null,
          husband_name: family.husband?.fullname ?? null,
          wife_id: family.wife?.voter_id ?? null,
          wife_name: family.wife?.fullname ?? null
        })
        .eq('id', family.id)

      if (error) {
        console.error('Error updating family:', error)
        toast.error('Failed to update family.')
        return
      }

      familyId = family.id
    } else {
      // INSERT family
      const { data, error } = await supabase
        .from('families')
        .insert([
          {
            household_id: currentHouseholdId,
            husband_id: family.husband?.voter_id ?? null,
            husband_name: family.husband?.fullname ?? null,
            wife_id: family.wife?.voter_id ?? null,
            wife_name: family.wife?.fullname ?? null,
            barangay: location?.name
          }
        ])
        .select()
        .single()

      if (error) {
        console.error('Error inserting family:', error)
        toast.error('Failed to add family.')
        return
      }

      familyId = data.id
    }

    // 4. Full Replace Family Members
    let insertedMembers: FamilyMember[] = []

    if (familyId) {
      // Delete all existing members
      await supabase.from('family_members').delete().eq('family_id', familyId)

      // Insert fresh members
      if (family.family_members?.length) {
        const inserts = family.family_members.map((member) => ({
          family_id: familyId,
          voter_id: member.is_registered ? member.voter_id : null,
          fullname: member.fullname,
          relation: member.relation,
          is_registered: member.is_registered,
          barangay: location?.name
        }))

        const { data: membersData, error: insertError } = await supabase
          .from('family_members')
          .insert(inserts)
          .select()

        if (insertError) {
          console.error('Error inserting members:', insertError)
          toast.error('Failed to save family members.')
          return
        }

        insertedMembers = membersData ?? []
      }
    }

    console.log('insertedMembers', insertedMembers)

    // 5. Prepare Family object for Redux
    savedFamily = {
      id: familyId,
      household_id: currentHouseholdId,
      husband: family.husband ?? null,
      wife: family.wife ?? null,
      husband_id: family.husband?.voter_id ?? null,
      husband_name: family.husband?.fullname ?? null,
      wife_id: family.wife?.voter_id ?? null,
      wife_name: family.wife?.fullname ?? null,
      family_members: insertedMembers
    } as Family

    // 6. Dispatch to Redux
    if (family.id) {
      dispatch(
        updateFamily({
          householdId: currentHouseholdId,
          family: savedFamily
        })
      )
    } else {
      dispatch(
        addFamily({
          householdId: currentHouseholdId,
          family: savedFamily
        })
      )
    }

    toast.success('Family saved successfully!')
    setShowFamilyModal(false)
  }

  const handleDeleteHousehold = async (householdId: number) => {
    try {
      // 1. Call Supabase to delete from DB
      const { error } = await supabase
        .from('households')
        .delete()
        .eq('id', householdId)

      if (error) throw error

      // 2. Update Redux state
      dispatch(deleteHousehold(householdId))

      toast.success('Household deleted successfully!')

      // 3. Close modal
      setShowHouseholdModal(false)
    } catch (err) {
      console.error('Failed to delete household:', err)
      toast.error('❌ Error deleting household. Please try again.')
    }
  }
  const handleDeleteFamily = async (householdId: number, familyId: number) => {
    try {
      // 1. Call Supabase to delete from DB
      const { error } = await supabase
        .from('families')
        .delete()
        .eq('id', familyId)

      if (error) throw error

      // 2. Update Redux state
      dispatch(deleteFamily({ householdId, familyId }))

      toast.success('Family deleted successfully!')

      // 3. Close modal
      setShowHouseholdModal(false)
    } catch (err) {
      console.error('Failed to delete Family:', err)
      toast.error('❌ Error deleting Family. Please try again.')
    }
  }

  // Fetch Households by Location
  const fetchHouseholds = async (page: number, searchText = '') => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      let householdIds: number[] = []

      if (searchText.trim()) {
        // 1️⃣ Get matching household IDs using RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'search_households',
          { search_text: searchText, location_id_param: locationIdNum }
        )

        if (rpcError) throw rpcError

        householdIds = (rpcData ?? []).map((h: any) => h.id)
      }

      // 2️⃣ Fetch full household data
      let data: any, count

      if (searchText.trim()) {
        if (householdIds.length === 0) {
          data = []
          count = 0
        } else {
          const {
            data: fullData,
            count: fullCount,
            error: fetchError
          } = await supabase
            .from('households')
            .select(
              `
          id, name, barangay, location_id,
          families (
            id, husband_name, wife_name, household_id,
            husband:voters!families_husband_id_fkey (id, fullname),
            wife:voters!families_wife_id_fkey (id, fullname),
            family_members (id, voter_id, fullname, is_registered, relation)
          )
        `,
              { count: 'exact' }
            )
            .in('id', householdIds)
            .range(from, to)
            .order('id', { ascending: false })

          if (fetchError) throw fetchError
          data = fullData ?? []
          count = fullCount ?? 0
        }
      } else {
        // Normal paginated fetch without search
        const {
          data: supData,
          count: supCount,
          error
        } = await supabase
          .from('households')
          .select(
            `
      id, name, purok,barangay, location_id,
      families (
        id, husband_name, wife_name, household_id,
        husband:voters!families_husband_id_fkey (id, fullname),
        wife:voters!families_wife_id_fkey (id, fullname),
        family_members (id, voter_id, fullname, is_registered, relation)
      )
    `,
            { count: 'exact' }
          )
          .eq('location_id', locationIdNum)
          .range(from, to)
          .order('id', { ascending: false })

        if (error) throw error
        data = supData ?? []
        count = supCount ?? 0
      }

      const mapped = (data ?? []).map((h: any) => ({
        id: h.id,
        name: h.name,
        purok: h.purok,
        sitio: h.sitio,
        barangay: h.barangay,
        location_id: h.location_id,
        families: (h.families ?? []).map((f: any) => ({
          ...f,
          id: f.id,
          barangay: h.barangay,
          household_id: f.household_id,
          husband: f.husband
            ? {
                id: f.husband.id,
                voter_id: f.husband.id,
                fullname: f.husband.fullname,
                is_registered: true
              }
            : null,
          wife: f.wife
            ? {
                id: f.wife.id,
                voter_id: f.wife.id,
                fullname: f.wife.fullname,
                is_registered: true
              }
            : null,
          family_members: (f.family_members ?? []).map((m: any) => ({
            id: m.voter_id ?? null,
            voter_id: m.voter_id ?? null,
            fullname: m.fullname,
            barangay: m.barangay,
            is_registered: m.is_registered,
            relation: m.relation
          }))
        }))
      }))

      dispatch(
        setHouseholds({
          households: mapped,
          totalCount: count,
          page
        })
      )
    } catch (err) {
      console.error('Error fetching households:', err)
    }
  }

  useEffect(() => {
    if (!locationIdNum) return

    dispatch(clearLocation()) // 👈 Clear old location when URL changes

    const fetchData = async () => {
      console.log('location details fetched')
      setLoading(true)

      // Super admin
      if (user?.admin) {
        const { data, error } = await supabase
          .from('locations')
          .select()
          .eq('id', locationIdNum)
          .single()

        if (error) {
          console.error('Error checking access:', error)
        }
        dispatch(setLocation(data))
      } else {
        const { data, error } = await supabase.rpc('check_location_access', {
          input_user_id: user?.system_user_id,
          input_location_id: locationIdNum
        })
        console.log('location details fetched2')

        if (error) {
          console.error('Error checking access:', error)
        } else if (data === false) {
          console.log('User has no access')
        } else if (data) {
          console.log('location details fetched2', data)
          dispatch(setLocation(data))
        }
      }

      setLoading(false)
    }
    void fetchData()
  }, [locationIdNum])

  // 🚀 Fetch households whenever page or location changes (but not directly on search)
  useEffect(() => {
    if (!locationIdNum) return

    fetchHouseholds(currentPage, search)
  }, [currentPage, locationIdNum]) // 👈 removed search here

  // 🔎 Debounced fetch on search input
  useEffect(() => {
    if (!locationIdNum) return

    const delayDebounce = setTimeout(() => {
      fetchHouseholds(1, search) // always reset to page 1 on search
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [search, locationIdNum])

  if (loading) {
    return <LoadingSkeleton />
  }

  if (!location) {
    return (
      <div className="space-y-4 w-full">
        <div className="app__title">
          <h1 className="text-xl font-semibold">Page not found</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="app__title flex">
        <h1 className="text-xl font-semibold flex-1">{location.name}</h1>
        <Button
          onClick={() => {
            setEditHousehold(null)
            setShowHouseholdModal(true)
          }}
        >
          + Add Household
        </Button>
      </div>

      <VerticalMenu activeTab="households" />

      <div className="flex justify-between my-4 p-4">
        <Input
          placeholder="Search households..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-1/3"
        />
      </div>

      {/* ✅ Toggle buttons */}
      <div className="flex justify-end gap-2 p-4">
        <Button
          variant={viewMode === 'grid' ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('grid')}
        >
          Grid View
        </Button>
        <Button
          variant={viewMode === 'list' ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('list')}
        >
          List View
        </Button>
      </div>
      {/* ✅ Conditional layout */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4'
            : 'flex flex-col gap-4 p-4'
        }
      >
        {households.map((h) => (
          <Card
            key={`household-${h.id}`}
            className={`rounded-none border-gray-300 ${
              viewMode === 'grid' ? 'bg-yellow-100' : ''
            }`}
          >
            <CardHeader>
              <CardTitle className="flex justify-between">
                <span>{h.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditHousehold(h)
                    setShowHouseholdModal(true)
                  }}
                >
                  ✎
                </Button>
              </CardTitle>
              <p className="text-sm text-gray-500">Purok: {h.purok}</p>
              {h.sitio && (
                <p className="text-sm text-gray-500">Sitio: {h.sitio}</p>
              )}
            </CardHeader>
            <CardContent>
              {h.families?.map((f) => (
                <div key={`family-${f.id}-${h.id}`} className="mb-3">
                  <p className="font-semibold">{f.husband_name}</p>
                  <p className="font-semibold">{f.wife_name}</p>
                  <ul className="ml-4 list-disc text-sm text-gray-700">
                    {f.family_members?.map((m, i) => (
                      <li key={i}>
                        {m.fullname} {m.is_registered ? '' : '(NR)'}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="link"
                    className="mt-1 text-blue-700"
                    onClick={() => {
                      setCurrentHouseholdId(h.id)
                      setEditFamily(f)
                      setShowFamilyModal(true)
                    }}
                  >
                    Edit Family
                  </Button>
                </div>
              ))}
              <Button
                size="xs"
                className="mt-2"
                onClick={() => {
                  setCurrentHouseholdId(h.id)
                  setEditFamily(null)
                  setShowFamilyModal(true)
                }}
              >
                + Add Family
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PAGINATION LINKS */}
      <div className="flex justify-center mt-6 space-x-2">
        {Array.from(
          { length: Math.ceil(totalCount / pageSize) },
          (_, i) => i + 1
        ).map((page) => (
          <button
            key={page}
            className={`px-3 py-1 rounded border ${
              page === currentPage ? 'bg-blue-500 text-white' : 'bg-white'
            }`}
            onClick={() => {
              dispatch(setPage(page)) // useEffect will handle fetch with current search, pageSize, and locationIdNum
            }}
          >
            {page}
          </button>
        ))}
      </div>

      {/* Modals */}
      <HouseholdModal
        open={showHouseholdModal}
        onClose={() => setShowHouseholdModal(false)}
        onSave={handleSaveHousehold}
        initialData={editHousehold}
        onDelete={handleDeleteHousehold} // ✅ wired to slice
      />

      <FamilyFormModal
        open={showFamilyModal}
        onCancel={() => setShowFamilyModal(false)}
        onSave={handleSaveFamily}
        initialFamily={editFamily}
        onDelete={handleDeleteFamily} // ✅ wired to slice
      />
    </div>
  )
}
