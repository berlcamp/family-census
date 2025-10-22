/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import LoadingSkeleton from '@/components/LoadingSkeleton'
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

  const dispatch = useAppDispatch()
  const location = useAppSelector((state) => state.location.selectedLocation)

  useEffect(() => {
    if (!locationId) return

    dispatch(clearLocation()) // 👈 Clear old location when URL changes

    const fetchData = async () => {
      console.log('location details fetched')
      setLoading(true)

      // Super admin
      if (user?.type === 'super admin') {
        const { data, error } = await supabase
          .from('locations')
          .select()
          .eq('id', locationId)
          .single()

        if (error) {
          console.error('Error checking access:', error)
        }
        dispatch(setLocation(data))
      } else {
        const { data, error } = await supabase.rpc('check_location_access', {
          input_user_id: user?.system_user_id,
          input_location_id: locationId
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
  }, [locationId])

  if (loading) {
    return <LoadingSkeleton />
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
