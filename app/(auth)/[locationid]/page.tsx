/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import LoadingSkeleton from '@/components/LoadingSkeleton'
import NoAccess from '@/components/NoAccess'
import Notfoundpage from '@/components/Notfoundpage'
import { OverviewTab } from '@/components/OverviewTab'
import VerticalMenu from '@/components/VerticalMenu'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import { clearLocation, setLocation } from '@/lib/redux/locationSlice'
import { supabase } from '@/lib/supabase/client'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)

  const params = useParams()
  const locationId = params?.locationid as string

  const [loading, setLoading] = useState(false)
  const [userHasAccess, setUserHasAccess] = useState(true)

  const dispatch = useAppDispatch()
  const location = useAppSelector((state) => state.location.selectedLocation)

  useEffect(() => {
    if (!locationId) return

    dispatch(clearLocation()) // 👈 Clear old location when URL changes

    const fetchData = async () => {
      console.log('location details fetched')
      setLoading(true)

      // Super admin
      if (user?.type === 'super admin' || user?.type === 'province admin') {
        const { data, error } = await supabase
          .from('locations')
          .select('*,service_providers(*)')
          .eq('address', user?.address)
          .eq('id', locationId)
          .single()

        if (error) {
          console.error('Error checking access:', error)
        }
        console.log('setLocation 1', data)
        dispatch(setLocation(data))
      } else {
        const { data, error } = await supabase.rpc('check_location_access', {
          input_user_id: user?.system_user_id,
          input_location_id: locationId
        })
        console.log('location details fetched2', data)

        if (error) {
          console.error('Error checking access2:', error)
        } else if (data === false) {
          console.log('User has no access')
        } else if (data) {
          console.log('setLocation 2', data)
          dispatch(setLocation(data))
        }
      }

      setLoading(false)
    }
    void fetchData()
  }, [locationId])

  useEffect(() => {
    const checkAccess = async () => {
      const { data: locationUser } = await supabase
        .from('location_users')
        .select()
        .eq('location_id', locationId)
        .eq('user_id', user?.system_user_id)
        .single()
      if (locationUser) {
        setUserHasAccess(!locationUser.is_disabled)
      }
    }
    if (user?.type === 'user' && location) {
      checkAccess()
    }
  }, [location, locationId, user])

  // Same source of truth as the households page: Settings > Edit Settings
  // (location_settings.enable_edit). null = not loaded yet.
  const [enableEdit, setEnableEdit] = useState<boolean | null>(null)

  useEffect(() => {
    if (!location?.address) return
    const loadSetting = async () => {
      const { data, error } = await supabase
        .from('location_settings')
        .select('enable_edit')
        .eq('address', location.address)
        .single()
      // Default: editing disabled unless explicitly enabled
      setEnableEdit(!error && data ? data.enable_edit === true : false)
    }
    void loadSetting()
  }, [location?.address])

  if (loading || (user?.type === 'user' && location && enableEdit === null)) {
    return <LoadingSkeleton />
  }

  if (enableEdit === false && user?.type === 'user') {
    return <NoAccess />
  }

  if (user?.type === 'user' && !userHasAccess) {
    return <NoAccess />
  }
  if (!location) {
    return <Notfoundpage />
  }

  return (
    <div className="w-full">
      <div className="app__title flex">
        <h1 className="text-xl font-semibold flex-1">{location.name}</h1>
      </div>

      <VerticalMenu activeTab="overview" />

      <div className="px-4">
        <div>
          <OverviewTab />
        </div>
      </div>
    </div>
  )
}
