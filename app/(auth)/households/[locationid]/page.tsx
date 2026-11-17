/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useRef, useState } from 'react'

import LoadingSkeleton from '@/components/LoadingSkeleton'
import NoAccess from '@/components/NoAccess'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import VerticalMenu from '@/components/VerticalMenu'
import { isOwner } from '@/lib/constants'
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
import { Family, FamilyMember, Household, LocationUser } from '@/types'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import FamilyEditor, { BadgeLegend, PersonLine } from './FamilyEditor'
import { Download, MapPin, Pencil, Plus, RotateCcw, Search as SearchIcon, UserRound } from 'lucide-react'
import { FilterChip, FilterSelect, HouseholdCardSkeleton } from './HouseholdFilters'
import HouseholdEditor from './HouseholdEditor'

export default function HouseholdsPage() {
  const { locationid } = useParams<{ locationid: string }>()
  const locationIdNum = Number(locationid)

  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  // Only the latest households request may update the list.
  const listRequest = useRef(0)
  // AP crossmatch result per person, for the AP badge (loaded after the list).
  const [apStatus, setApStatus] = useState<{
    families: Record<number, { husband: boolean | null; wife: boolean | null }>
    members: Record<number, boolean | null>
  }>({ families: {}, members: {} })
  const [userHasAccess, setUserHasAccess] = useState<LocationUser | null>(null)

  const [selectedDate, setSelectedDate] = useState('')

  const households = useAppSelector(selectPaginatedHouseholds)

  // Get pagination info from Redux
  const { currentPage, pageSize, totalCount } = useAppSelector(
    (state) => state.householdsList
  )

  const [search, setSearch] = useState('')
  // Filters of the list currently shown (for the chips and the count).
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    purok: '',
    sp: ''
  })
  const [purok, setPurok] = useState('')
  const [sp, setSp] = useState('')

  const [enableEdit, setEnableEdit] = useState(false)


  // The one family being added or edited inline (familyId null = new).
  // The one thing being added or edited inline: a family (familyId null =
  // new family) or a household (householdId null = new household).
  const [editing, setEditing] = useState<
    | { kind: 'family'; householdId: number; familyId: number | null }
    | { kind: 'household'; householdId: number | null }
    | null
  >(null)
  // Whether the open family editor has unsaved changes.
  const editorDirty = useRef(false)

  const dispatch = useAppDispatch()
  const location = useAppSelector((state) => state.location.selectedLocation)
  const user = useAppSelector((state) => state.user.user)

  // Save Household
  // Returns true when saved, so the inline editor can close.
  const handleSaveHousehold = async (
    household: Partial<Household>
  ): Promise<boolean> => {
    if (!location) return false

    if (household.id) {
      // UPDATE existing household
      const { data, error } = await supabase
        .from('households')
        .update({
          name: household.name,
          purok: household.purok,
          sp_id: household.sp === '' ? null : Number(household.sp),
          barangay: location.name,
          address: location.address,
          location_id: locationIdNum
        })
        .eq('id', household.id)
        .select('*,service_provider:sp_id(*)')
        .single()

      if (error) {
        toast.error('Error updating household')
        return false
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
            sp_id: household.sp === '' ? null : Number(household.sp),
            barangay: location.name,
            address: location.address,
            location_id: locationIdNum
          }
        ])
        .select('*,service_provider:sp_id(*)')
        .single()

      if (error) {
        toast.error('Error adding household')
        return false
      }

      dispatch(
        addHousehold({
          ...data,
          families: []
        })
      )

      // Log user action
      await supabase.rpc('log_action', {
        p_location_id: locationIdNum,
        p_system_user_id: user?.system_user_id,
        p_user_name: user?.name,
        p_action: 'Added New Household',
        p_details: `Added new household: ${household.name}`
      })
    }

    toast.success('Household saved successfully!')
    return true
  }

  // Save Family (Full Replace Strategy)
  // Returns true when saved, so the inline editor can close.
  const handleSaveFamily = async (
    householdId: number,
    family: Partial<Family>
  ): Promise<boolean> => {

    // 1. Check if husband, wife, or any member is registered
    const hasHusband = !!family.husband?.voter_id
    const hasWife = !!family.wife?.voter_id
    const hasRegisteredMember = family.family_members?.some(
      (m) => m.is_registered && !!m.voter_id
    )

    if (
      !hasHusband &&
      !hasWife &&
      !hasRegisteredMember &&
      !family.allowNonRegistered
    ) {
      toast.error(
        'At least one of Husband, Wife, or Family Members must be a registered voter.'
      )
      return false
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
        return false
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
        return false
      }
    }

    let familyId = family.id
    let savedFamily: Family | null = null

    // 🔍 Check if absolutely everyone is non-registered
    const isAllNonRegistered =
      !family.husband?.voter_id &&
      !family.wife?.voter_id &&
      (family.family_members?.every((m) => !m.is_registered || !m.voter_id) ??
        true)

    // console.log('new', family.husband, family.wife, family.family_members)

    // 3. Save Family (Insert or Update)
    if (family.id) {
      // UPDATE family
      const { error } = await supabase
        .from('families')
        .update({
          household_id: householdId,
          sp: family.sp,
          husband_id: family.husband?.voter_id ?? null,
          husband_name: family.husband?.fullname ?? null,
          wife_id: family.wife?.voter_id ?? null,
          wife_name: family.wife?.fullname ?? null,
          asenso_husband: family.husband?.is_asenso ?? null,
          asenso_wife: family.wife?.is_asenso ?? null,
          all_nr: isAllNonRegistered // 🔥 set column
        })
        .eq('id', family.id)

      if (error) {
        console.error('Error updating family:', error)
        toast.error('Failed to update family.')
        return false
      }

      familyId = family.id
    } else {
      // INSERT family
      const { data, error } = await supabase
        .from('families')
        .insert([
          {
            household_id: householdId,
            sp: family.sp,
            husband_id: family.husband?.voter_id ?? null,
            husband_name: family.husband?.fullname ?? null,
            wife_id: family.wife?.voter_id ?? null,
            wife_name: family.wife?.fullname ?? null,
            asenso_husband: family.husband?.is_asenso ?? null,
            asenso_wife: family.wife?.is_asenso ?? null,
            barangay: location?.name,
            all_nr: isAllNonRegistered // 🔥 set column
          }
        ])
        .select()
        .single()

      if (error) {
        console.error('Error inserting family:', error)
        toast.error('Failed to add family.')
        return false
      }

      familyId = data.id
    }

    // 4. Save family members in place.
    //    Existing rows are updated (keeping their id, so is_ap_member,
    //    address, category, Kadiwa claims and AP match results stay linked),
    //    new ones are inserted, and only members removed in the form are
    //    deleted. Deletes run last, after everything else has succeeded.
    let savedMembers: FamilyMember[] = []

    if (familyId) {
      const { data: currentRows, error: currentError } = await supabase
        .from('family_members')
        .select('id')
        .eq('family_id', familyId)

      if (currentError) {
        console.error('Error loading members:', currentError)
        toast.error('Failed to save family members.')
        return false
      }

      const currentIds = new Set((currentRows ?? []).map((r) => r.id))
      const memberFields = (member: FamilyMember) => ({
        voter_id: member.is_registered ? member.voter_id ?? null : null,
        fullname: member.fullname,
        relation: member.relation,
        is_registered: member.is_registered,
        asenso: member.asenso
      })

      const formMembers = family.family_members ?? []
      const keptIds = new Set<number>()

      for (const member of formMembers) {
        const memberId = member.member_id
        if (memberId && currentIds.has(memberId)) {
          const { data, error } = await supabase
            .from('family_members')
            .update(memberFields(member))
            .eq('id', memberId)
            .eq('family_id', familyId)
            .select()
            .single()
          if (error) {
            console.error('Error updating member:', error)
            toast.error('Failed to save family members.')
            return false
          }
          keptIds.add(memberId)
          savedMembers.push(data)
        } else {
          const { data, error } = await supabase
            .from('family_members')
            .insert({
              ...memberFields(member),
              family_id: familyId,
              barangay: location?.name
            })
            .select()
            .single()
          if (error) {
            console.error('Error inserting member:', error)
            toast.error('Failed to save family members.')
            return false
          }
          savedMembers.push(data)
        }
      }

      const removedIds = [...currentIds].filter((id) => !keptIds.has(id))
      if (removedIds.length) {
        const { error } = await supabase
          .from('family_members')
          .delete()
          .in('id', removedIds)
          .eq('family_id', familyId)
        if (error) {
          console.error('Error removing members:', error)
          toast.error('Family saved, but removed members could not be deleted.')
          return false
        }
      }

      // Same shape the list uses (id = voter id, member_id = row id).
      savedMembers = savedMembers.map((m) => ({
        ...m,
        id: m.voter_id ?? undefined,
        member_id: m.id
      }))
    }

    // 5. Prepare Family object for Redux
    savedFamily = {
      id: familyId,
      household_id: householdId,
      husband: family.husband ?? null,
      wife: family.wife ?? null,
      husband_id: family.husband?.voter_id ?? null,
      husband_name: family.husband?.fullname ?? null,
      wife_id: family.wife?.voter_id ?? null,
      wife_name: family.wife?.fullname ?? null,
      asenso_husband: family.husband?.is_asenso || false,
      asenso_wife: family.wife?.is_asenso || false,
      family_members: savedMembers
    } as Family

    // 6. Dispatch to Redux
    if (family.id) {
      dispatch(
        updateFamily({
          householdId: householdId,
          family: savedFamily
        })
      )

      // Log user action
      await supabase.rpc('log_action', {
        p_location_id: locationIdNum,
        p_system_user_id: user?.system_user_id,
        p_user_name: user?.name,
        p_action: 'Updated Family',
        p_details: `Updated family on household ID:${householdId}`
      })
    } else {
      dispatch(
        addFamily({
          householdId: householdId,
          family: savedFamily
        })
      )

      // Log user action
      await supabase.rpc('log_action', {
        p_location_id: locationIdNum,
        p_system_user_id: user?.system_user_id,
        p_user_name: user?.name,
        p_action: 'Added New Family',
        p_details: `Added new family on household ID:${householdId}`
      })
    }

    toast.success('Family saved successfully!')
    return true
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

      // Log user action
      await supabase.rpc('log_action', {
        p_location_id: locationIdNum,
        p_system_user_id: user?.system_user_id,
        p_user_name: user?.name,
        p_action: 'Deleted Household',
        p_details: `Deleted household ID:${householdId}`
      })

      toast.success('Household deleted successfully!')

      // 3. Close the inline editor
      closeEditor()
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

      // Log user action
      await supabase.rpc('log_action', {
        p_location_id: locationIdNum,
        p_system_user_id: user?.system_user_id,
        p_user_name: user?.name,
        p_action: 'Deleted Family',
        p_details: `Deleted family ID:${familyId} of household ID:${householdId}`
      })

      toast.success('Family deleted successfully!')

      // 3. Close the inline editor
      closeEditor()
    } catch (err) {
      console.error('Failed to delete Family:', err)
      toast.error('❌ Error deleting Family. Please try again.')
    }
  }

  const handleDownloadLogs = async () => {
    if (!selectedDate) {
      alert('Please select a date.')
      return
    }

    // Fetch logs from Supabase (adjust the table name)
    const { data, error } = await supabase
      .from('system_logs')
      .select('*')
      .gte('created_at', `${selectedDate} 00:00:00`)
      .lte('created_at', `${selectedDate} 23:59:59`)
      .order('created_at')

    if (error) {
      console.error(error)
      alert('Failed to fetch logs.')
      return
    }

    // Build text output
    const textContent = data.length
      ? data
          .map((log) => `[${log.created_at}] ${log.user_name} — ${log.details}`)
          .join('\n')
      : 'No logs found for this date.'

    // Create downloadable TXT file
    const blob = new Blob([textContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `user_logs_${selectedDate}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  // AP badges: ask the server for these households' crossmatch results.
  // Failure only hides the badges; the list itself is unaffected.
  const loadApStatus = async (householdIds: number[], requestId: number) => {
    if (householdIds.length === 0) return
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      const response = await fetch('/api/ap-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`
        },
        body: JSON.stringify({ householdIds })
      })
      if (!response.ok) return
      const body = await response.json()
      if (requestId === listRequest.current) setApStatus(body)
    } catch (err) {
      console.error('Could not load AP status:', err)
    }
  }

  const applyFilters = (searchText: string, purokText: string, spText: string) => {
    setAppliedFilters({ search: searchText.trim(), purok: purokText, sp: spText })
    // Changing the page reloads the list (with the same filters) by itself.
    if (currentPage !== 1) dispatch(setPage(1))
    else fetchHouseholds(1, searchText, purokText, spText)
  }

  // Fetch Households by Location
  const fetchHouseholds = async (
    page: number,
    searchText = '',
    purokText = '',
    spText = ''
  ) => {
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const requestId = ++listRequest.current
    setListLoading(true)

    try {
      let householdIds: number[] = []

      if (searchText.trim() || purokText.trim() || spText.trim()) {
        // ✅ Call RPC with both search and purok
        let sp_id_param: number | null

        if (spText === '') {
          // All SP selected
          sp_id_param = null
        } else if (spText === 'none') {
          // No SP selected
          sp_id_param = -1 // special marker in RPC
        } else {
          // Specific SP selected
          sp_id_param = Number(spText)
        }

        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'search_households',
          {
            location_id_param: locationIdNum,
            sp_id_param,
            purok_text: purokText,
            search_text: searchText,
            min_threshold: 0.3
          }
        )

        if (rpcError) throw rpcError
        householdIds = (rpcData ?? []).map((h: any) => h.id)
      }

      // 2️⃣ Fetch full household data
      let data: any, count

      if (searchText.trim() || purokText.trim() || spText.trim()) {
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
          id, name, series_number, barangay, sp_id, location_id,purok,
          service_provider:sp_id(*),
          families (
            id, sp, husband_name, wife_name, household_id,all_nr,asenso_husband,asenso_wife,
            husband:voters!families_husband_id_fkey (id, fullname),
            wife:voters!families_wife_id_fkey (id, fullname),
            family_members (id, voter_id, fullname, is_registered, relation,asenso)
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
      id, name, series_number, sp_id, purok,barangay, location_id,
      service_provider:sp_id(*),
      families (
        id, sp, husband_name, wife_name, household_id,all_nr,asenso_husband,asenso_wife,
        husband:voters!families_husband_id_fkey (id, fullname),
        wife:voters!families_wife_id_fkey (id, fullname),
        family_members (id, voter_id, fullname, is_registered,asenso, relation)
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
        sp: h.sp,
        series_number: h.series_number,
        service_provider: h.service_provider,
        sp_id: h.sp_id,
        barangay: h.barangay,
        location_id: h.location_id,
        families: (h.families ?? []).map((f: any) => ({
          ...f,
          id: f.id,
          barangay: h.barangay,
          all_nr: f.all_nr,
          sp: f.sp,
          household_id: f.household_id,
          husband:
            f.husband || f.husband_name
              ? {
                  id: f.husband?.id ?? null,
                  voter_id: f.husband?.id ?? null, // will only exist if registered
                  fullname: f.husband?.fullname || f.husband_name, // prefer voters.fullname else stored name
                  is_registered: !!f.husband?.id,
                  is_asenso: f.asenso_husband
                }
              : null,

          wife:
            f.wife || f.wife_name
              ? {
                  id: f.wife?.id ?? null,
                  voter_id: f.wife?.id ?? null,
                  fullname: f.wife?.fullname || f.wife_name,
                  is_registered: !!f.wife?.id,
                  is_asenso: f.asenso_wife
                }
              : null,

          family_members: (f.family_members ?? []).map((m: any) => ({
            id: m.voter_id ?? null,
            member_id: m.id,
            voter_id: m.voter_id ?? null,
            fullname: m.fullname,
            barangay: m.barangay,
            is_registered: m.is_registered,
            relation: m.relation,
            asenso: m.asenso
          }))
        }))
      }))

      if (requestId !== listRequest.current) return
      dispatch(
        setHouseholds({
          households: mapped,
          totalCount: count,
          page
        })
      )
      void loadApStatus(
        mapped.map((h: any) => h.id),
        requestId
      )
    } catch (err) {
      console.error('Error fetching households:', err)
      if (requestId === listRequest.current) toast.error('Could not load households.')
    } finally {
      if (requestId === listRequest.current) setListLoading(false)
    }
  }

  // Load the barangay, the user's access row and the edit setting together,
  // so the page is not waiting on one request after another.
  useEffect(() => {
    if (!locationIdNum || !user) return

    dispatch(clearLocation()) // 👈 Clear old location when URL changes
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      const isAdmin =
        user.type === 'super admin' || user.type === 'province admin'

      const locationRequest = isAdmin
        ? supabase
            .from('locations')
            .select('*,service_providers(*)')
            .eq('address', user.address)
            .eq('id', locationIdNum)
            .single()
        : supabase.rpc('check_location_access', {
            input_user_id: user.system_user_id,
            input_location_id: locationIdNum
          })
      const accessRequest =
        user.type === 'user'
          ? supabase
              .from('location_users')
              .select()
              .eq('location_id', locationIdNum)
              .eq('user_id', user.system_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null })

      const [locationRes, accessRes] = await Promise.all([
        locationRequest,
        accessRequest
      ])
      if (cancelled) return

      if (locationRes.error) {
        console.error('Error checking access:', locationRes.error)
      }
      const loc = locationRes.data && locationRes.data !== false ? locationRes.data : null
      setUserHasAccess(accessRes.data ?? null)

      let editSetting = false
      if (loc?.address) {
        const { data, error } = await supabase
          .from('location_settings')
          .select('enable_edit')
          .eq('address', loc.address)
          .maybeSingle()
        // Default: editing disabled unless explicitly enabled
        editSetting = !error && !!data?.enable_edit
      }
      if (cancelled) return

      setEnableEdit(editSetting)
      if (loc) dispatch(setLocation(loc))
      setLoading(false)
    }
    void fetchData()
    return () => {
      cancelled = true
    }
  }, [dispatch, locationIdNum, user])

  // 🚀 Fetch households whenever page or location changes (but not directly on search)
  useEffect(() => {
    if (!locationIdNum) return

    fetchHouseholds(currentPage, search, purok, sp)
  }, [currentPage, locationIdNum]) // 👈 removed search here

  const enableEdit2 =
    user?.type === 'super admin' ||
    user?.type === 'province admin' ||
    userHasAccess?.is_editor === true
  const canEdit = enableEdit && enableEdit2

  // Open a family editor (familyId null = new family). Only one is open at a
  // time: opening another closes the current one, asking first if it has
  // unsaved changes.
  const isEditingFamily = (householdId: number, familyId: number | null) =>
    editing?.kind === 'family' &&
    editing.householdId === householdId &&
    editing.familyId === familyId
  const isEditingHousehold = (householdId: number | null) =>
    editing?.kind === 'household' && editing.householdId === householdId

  const openEditor = (householdId: number, familyId: number | null) =>
    switchEditor({ kind: 'family', householdId, familyId })
  const openHouseholdEditor = (householdId: number | null) =>
    switchEditor({ kind: 'household', householdId })

  const switchEditor = (next: NonNullable<typeof editing>) => {
    if (JSON.stringify(next) === JSON.stringify(editing)) return
    if (
      editing &&
      editorDirty.current &&
      !window.confirm('Discard the unsaved changes you are editing?')
    ) {
      return
    }
    editorDirty.current = false
    setEditing(next)
  }
  const closeEditor = () => {
    editorDirty.current = false
    setEditing(null)
  }
  const setEditorDirty = (dirty: boolean) => {
    editorDirty.current = dirty
  }
  const hasFilters = !!(
    appliedFilters.search ||
    appliedFilters.purok ||
    appliedFilters.sp
  )

  if (user?.type === 'user' && userHasAccess?.is_disabled) {
    return <NoAccess />
  }

  if (loading) {
    return <LoadingSkeleton />
  }

  if (!enableEdit && user?.type === 'user') {
    return <NoAccess />
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
      </div>

      <VerticalMenu activeTab="households" />

      {/* Filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters(search, purok, sp)
        }}
        className="mx-4 mt-4 rounded-lg border bg-white p-3 shadow-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search a name in this barangay…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8"
            />
          </div>

          <FilterSelect
            icon={<MapPin className="h-4 w-4" />}
            value={purok}
            onChange={(v) => {
              setPurok(v)
              applyFilters(search, v, sp)
            }}
            options={[
              { value: '', label: 'All puroks' },
              ...(Array.isArray(location?.purok)
                ? location.purok.map((p: string) => ({ value: p, label: p }))
                : [])
            ]}
          />

          <FilterSelect
            icon={<UserRound className="h-4 w-4" />}
            value={sp}
            onChange={(v) => {
              setSp(v)
              applyFilters(search, purok, v)
            }}
            options={[
              { value: '', label: 'All SPs' },
              { value: 'none', label: 'No SP' },
              ...(location?.service_providers ?? [])
                .slice()
                .sort((x, y) => x.name.localeCompare(y.name))
                .map((x) => ({ value: String(x.id), label: x.name }))
            ]}
          />

          <Button type="submit" variant="blue" className="h-9">
            Search
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="h-9 text-gray-600"
              onClick={() => {
                setSearch('')
                setPurok('')
                setSp('')
                applyFilters('', '', '')
              }}
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span>
            {listLoading
              ? 'Loading…'
              : `${totalCount.toLocaleString()} ${hasFilters ? 'matching ' : ''}household${totalCount === 1 ? '' : 's'}`}
          </span>
          {appliedFilters.search && (
            <FilterChip
              label={`Name: ${appliedFilters.search}`}
              onClear={() => {
                setSearch('')
                applyFilters('', purok, sp)
              }}
            />
          )}
          {appliedFilters.purok && (
            <FilterChip
              label={`Purok: ${appliedFilters.purok}`}
              onClear={() => {
                setPurok('')
                applyFilters(search, '', sp)
              }}
            />
          )}
          {appliedFilters.sp && (
            <FilterChip
              label={`SP: ${
                appliedFilters.sp === 'none'
                  ? 'None'
                  : location?.service_providers?.find(
                      (x) => String(x.id) === appliedFilters.sp
                    )?.name ?? appliedFilters.sp
              }`}
              onClear={() => {
                setSp('')
                applyFilters(search, purok, '')
              }}
            />
          )}
        </div>
      </form>

      {/* Badge legend + user logs */}
      <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <BadgeLegend />
        {/* User logs: owner only */}
        {isOwner(user?.email) && (
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
            <span>User logs</span>
            <input
              type="date"
              className="h-7 rounded border px-1 text-xs"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
            <Button variant="outline" size="xs" onClick={handleDownloadLogs}>
              <Download className="h-3 w-3" /> Download
            </Button>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mx-4 mt-3">
          <Button
            onClick={() => openHouseholdEditor(null)}
            disabled={isEditingHousehold(null)}
          >
            <Plus className="h-4 w-4" /> Add Household
          </Button>
        </div>
      )}

      {!listLoading && households.length === 0 && (
        <div className="p-4 text-xl text-gray-600">No households found.</div>
      )}

      {listLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <HouseholdCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ✅ Conditional layout */}
      <div
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 ${
          listLoading ? 'hidden' : ''
        }`}
      >
        {isEditingHousehold(null) && (
          <Card className="gap-2 rounded-none border-gray-300 bg-yellow-100 py-3">
            <CardContent className="px-3">
              <HouseholdEditor
                initialData={null}
                onSave={handleSaveHousehold}
                onCancel={closeEditor}
                onDirtyChange={setEditorDirty}
              />
            </CardContent>
          </Card>
        )}
        {households.map((h) => (
          <Card
            key={`household-${h.id}`}
            className="gap-2 rounded-none border-gray-300 bg-yellow-100 py-3"
          >
            <CardHeader className="gap-0 px-3">
              {isEditingHousehold(h.id) ? (
                <HouseholdEditor
                  initialData={h}
                  onSave={handleSaveHousehold}
                  onDelete={() => handleDeleteHousehold(h.id)}
                  onCancel={closeEditor}
                  onDirtyChange={setEditorDirty}
                />
              ) : (
                <>
                  <CardTitle className="mb-1 flex items-start justify-between gap-2">
                    <span className="text-blue-800 font-bold">{h.name}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openHouseholdEditor(h.id)}
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-normal text-blue-700 hover:underline"
                      >
                        <Pencil className="h-3 w-3" /> Edit Household
                      </button>
                    )}
                  </CardTitle>
                  <div className="text-sm leading-snug text-gray-500">
                    <p>Household No: HH-{h.series_number}</p>
                    <p>Purok: {h.purok}</p>
                    <p>SP: {h.service_provider?.name ?? 'None'}</p>
                    {h.sitio && <p>Sitio: {h.sitio}</p>}
                  </div>
                </>
              )}
            </CardHeader>
            <CardContent className="px-3">
              {h.families?.map((f) =>
                isEditingFamily(h.id, f.id) ? (
                  <FamilyEditor
                    key={`edit-${f.id}`}
                    initialFamily={f}
                    onSave={(family) => handleSaveFamily(h.id, family)}
                    onDelete={() => handleDeleteFamily(h.id, f.id)}
                    onCancel={closeEditor}
                    onDirtyChange={setEditorDirty}
                  />
                ) : (
                  <div
                    key={`family-${f.id}-${h.id}`}
                    className={`group mb-2 rounded px-2 py-1.5 ${
                      f.all_nr ? 'bg-red-100 border border-red-300' : ''
                    } ${canEdit ? 'cursor-pointer hover:bg-yellow-200/60' : ''}`}
                    onClick={() => {
                      if (canEdit) openEditor(h.id, f.id)
                    }}
                    title={canEdit ? 'Click to edit family' : undefined}
                  >
                    {f.husband_name && (
                      <PersonLine
                        className="font-semibold"
                        name={f.husband_name}
                        registered={!!f.husband?.voter_id}
                        ap={apStatus.families[f.id]?.husband}
                        asenso={f.asenso_husband}
                      />
                    )}
                    {f.wife_name && (
                      <PersonLine
                        className="font-semibold"
                        name={f.wife_name}
                        registered={!!f.wife?.voter_id}
                        ap={apStatus.families[f.id]?.wife}
                        asenso={f.asenso_wife}
                      />
                    )}
                    <ul className="ml-4 list-disc text-sm text-gray-700">
                      {f.family_members?.map((m, i) => (
                        <li key={m.member_id ?? i}>
                          <PersonLine
                            className="font-semibold"
                            name={m.fullname}
                            registered={!!m.is_registered}
                            ap={
                              m.member_id
                                ? apStatus.members[m.member_id]
                                : undefined
                            }
                            asenso={m.asenso}
                          />
                        </li>
                      ))}
                    </ul>
                    {canEdit && (
                      <span className="mt-1 inline-block text-xs text-blue-700 opacity-60 group-hover:opacity-100">
                        ✎ Edit family
                      </span>
                    )}
                  </div>
                )
              )}
              {isEditingFamily(h.id, null) ? (
                <FamilyEditor
                  key={`new-${h.id}`}
                  initialFamily={null}
                  onSave={(family) => handleSaveFamily(h.id, family)}
                  onCancel={closeEditor}
                  onDirtyChange={setEditorDirty}
                />
              ) : (
                canEdit && (
                  <Button
                    size="xs"
                    className="mt-2"
                    onClick={() => openEditor(h.id, null)}
                  >
                    + Add Family
                  </Button>
                )
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PAGINATION LINKS */}
      <div className="flex justify-center my-6">
        <div className="flex flex-wrap justify-center gap-2 max-w-full px-2">
          {Array.from(
            { length: Math.ceil(totalCount / pageSize) },
            (_, i) => i + 1
          ).map((page) => (
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
      </div>

    </div>
  )
}
