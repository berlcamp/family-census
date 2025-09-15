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
  selectPaginatedHouseholds,
  selectTotalPages,
  setHouseholds,
  setPage,
  updateFamily,
  updateHousehold
} from '@/lib/redux/householdsSlice'
import { clearLocation, setLocation } from '@/lib/redux/locationSlice'
import { supabase } from '@/lib/supabase/client'
import { Family, Household } from '@/types'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import FamilyFormModal from './FamilyFormModal'
import HouseholdModal from './HouseholdModal'

export default function HouseholdsPage() {
  const { locationid } = useParams<{ locationid: string }>()
  const locationIdNum = Number(locationid)

  const [loading, setLoading] = useState(false)

  const paginated = useAppSelector(selectPaginatedHouseholds)
  const totalPages = useAppSelector(selectTotalPages)
  const currentPage = useAppSelector(
    (state) => state.householdsList.currentPage
  )
  console.log('paginated', paginated)
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
    if (household.id) {
      // UPDATE
      const { data, error } = await supabase
        .from('households')
        .update({
          name: household.name,
          barangay: location?.name,
          address: location?.address,
          location_id: locationIdNum
        })
        .eq('id', household.id)
        .select()
        .single()

      if (error) {
        toast.error('Error updating household')
        setShowHouseholdModal(false)
        return
      }

      dispatch(updateHousehold({ ...data, families: household.families ?? [] }))
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('households')
        .insert([
          {
            name: household.name,
            barangay: location?.name,
            address: location?.address,
            location_id: locationIdNum
          }
        ])
        .select()
        .single()

      if (error) {
        toast.error('Error updating household')
        setShowHouseholdModal(false)
        return
      }

      dispatch(addHousehold({ ...data, families: [] }))
    }
    setShowHouseholdModal(false)
  }

  // Save Family
  const handleSaveFamily = async (family: Partial<Family>) => {
    if (!currentHouseholdId) return

    // 1. Husband or Wife must be set
    if (!family.husband?.voter_id && !family.wife?.voter_id) {
      toast.error('At least one of Husband or Wife must be a registered voter.')
      return
    }

    // 2. Check duplicates (husband/wife already part of another family)
    if (family.husband?.voter_id) {
      const { data: existingHusband } = await supabase
        .from('families')
        .select('id')
        .eq('husband_id', family.husband.voter_id)
        .neq('id', family.id ?? 0)

      if (existingHusband?.length) {
        toast.error(
          `${family.husband.fullname} is already a Husband in another family.`
        )
        return
      }
    }

    if (family.wife?.voter_id) {
      const { data: existingWife } = await supabase
        .from('families')
        .select('id')
        .eq('wife_id', family.wife.voter_id)
        .neq('id', family.id ?? 0)

      if (existingWife?.length) {
        toast.error(
          `${family.wife.fullname} is already a Wife in another family.`
        )
        return
      }
    }

    let familyId = family.id

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

      dispatch(
        updateFamily({
          householdId: currentHouseholdId,
          family: family as Family
        })
      )
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
            wife_name: family.wife?.fullname ?? null
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

      dispatch(
        addFamily({
          householdId: currentHouseholdId,
          family: { ...data, family_members: [] } as Family
        })
      )
    }

    // 4. Save Family Members (with duplicate check)
    if (family.family_members?.length) {
      for (const member of family.family_members) {
        // Prevent duplicate registered members
        if (member.voter_id) {
          const { data: existingMember } = await supabase
            .from('family_members')
            .select('id')
            .eq('voter_id', member.voter_id)

          if (existingMember?.length) {
            toast.error(`${member.fullname} is already a family member.`)
            continue
          }
        }

        // Insert member
        await supabase.from('family_members').insert([
          {
            family_id: familyId,
            voter_id: member.is_registered ? member.voter_id : null,
            full_name: member.fullname,
            relation: member.relation,
            is_registered: member.is_registered
          }
        ])
      }
    }

    // ✅ success
    toast.success('Family saved successfully!')
    setShowFamilyModal(false)
  }

  // Fetch Households by Location
  const fetchHouseholds = async (locationIdNum: number) => {
    try {
      const { data, error } = await supabase
        .from('households')
        .select(
          `
          id, name, barangay, location_id,
          families (
            id, husband_name,wife_name,household_id,
            husband:voters!families_husband_id_fkey (id, fullname),
            wife:voters!families_wife_id_fkey (id, fullname),
            family_members (id, voter_id, full_name, is_registered, relation)
          )
        `
        )
        .eq('location_id', locationIdNum)

      if (error) throw error

      const mapped: Household[] = (data ?? []).map((h: any) => ({
        id: h.id,
        name: h.name,
        barangay: h.barangay,
        location_id: h.location_id,
        families: (h.families ?? []).map((f: any) => ({
          ...f,
          id: f.id,
          household_id: f.household_id,
          husband: f.husband?.length
            ? {
                id: f.husband[0].id,
                fullname: f.husband[0].fullname,
                is_registered: true
              }
            : null,
          wife: f.wife?.length
            ? {
                id: f.wife[0].id,
                fullname: f.wife[0].fullname,
                is_registered: true
              }
            : null,
          family_members: (f.family_members ?? []).map((m: any) => ({
            id: m.id,
            fullname: m.full_name,
            is_registered: m.is_registered,
            relation: m.relation
          }))
        }))
      }))

      // ✅ update Redux state
      dispatch(setHouseholds(mapped))
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

  // 🚀 Fetch households for this location
  useEffect(() => {
    if (!locationIdNum) return
    fetchHouseholds(locationIdNum)
  }, [locationIdNum])

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
          className="w-1/3"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {paginated.map((h) => (
          <Card key={h.id}>
            <CardHeader>
              <CardTitle className="flex justify-between">
                <span>{h.name}</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditHousehold(h)
                    setShowHouseholdModal(true)
                  }}
                >
                  ✎
                </Button>
              </CardTitle>
              <p className="text-sm text-gray-500">{h.barangay}</p>
            </CardHeader>
            <CardContent>
              {h.families?.map((f) => (
                <div key={f.id} className="mb-3">
                  <p className="font-semibold">
                    {f.husband_name} &amp; {f.wife_name}
                  </p>
                  <ul className="ml-4 list-disc text-sm text-gray-600">
                    {f.family_members?.map((m, i) => (
                      <li key={i}>
                        {m.fullname} {m.is_registered ? '' : '(NR)'} –{' '}
                        {m.relation}
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1"
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
                size="sm"
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
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            className={`px-3 py-1 rounded border ${
              page === currentPage ? 'bg-blue-500 text-white' : 'bg-white'
            }`}
            onClick={() => dispatch(setPage(page))}
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
      />

      <FamilyFormModal
        open={showFamilyModal}
        onCancel={() => setShowFamilyModal(false)}
        onSave={handleSaveFamily}
        initialFamily={editFamily}
      />
    </div>
  )
}
