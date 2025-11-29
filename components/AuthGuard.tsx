'use client'

import { addList } from '@/lib/redux/locationsSlice'
import { setUser } from '@/lib/redux/userSlice'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import LoadingSkeleton from './LoadingSkeleton'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const dispatch = useDispatch()

  useEffect(() => {
    const loadSessionAndUser = async () => {
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession()

      if (sessionError || !session?.user) {
        console.error('No session found:', sessionError)
        router.replace('/auth/unverified') // Or login
        setLoading(false)
        return
      }

      const { data: systemUser, error: userError } = await supabase
        .from('users')
        .select()
        .eq('email', session.user.email)
        .eq('is_active', true)
        .single()

      if (userError || !systemUser) {
        console.error('System user not found or inactive:', userError)
        await supabase.auth.signOut()
        router.replace('/auth/unverified')
        setLoading(false)
        return
      }

      // Fetch locations the user is allowed to access
      try {
        let locations = []
        let admin = false
        if (
          systemUser.type === 'super admin' ||
          systemUser.type === 'province admin'
        ) {
          // Super admins
          const { data, error } = await supabase
            .from('locations')
            .select('*')
            .eq('address', systemUser.address)
            .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)
            .order('name', { ascending: true })

          if (error) throw error
          locations = data
          admin = true

          // Update state
          dispatch(addList(locations))
        } else {
          // Regular user: fetch locations they have access to
          const { data: allowed, error: allowedError } = await supabase
            .from('location_users')
            .select('location_id')
            .eq('user_id', systemUser.id)

          if (allowedError) throw allowedError

          const locationIds = allowed.map((b) => b.location_id)
          if (locationIds.length === 0) {
            locations = []
          } else {
            const idList = `(${locationIds.join(',')})`

            const { data, error } = await supabase
              .from('locations')
              .select('*')
              // .eq('address', systemUser.address)
              .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)
              .filter('id', 'in', idList)
              .order('name', { ascending: true })

            if (error) throw error
            locations = data

            // Update state
            dispatch(addList(locations))
          }
        }

        dispatch(
          setUser({
            ...session.user,
            system_user_id: systemUser.id,
            admin,
            name: systemUser.name,
            type: systemUser.type,
            address: systemUser.address,
            location_ids: locations.length > 0 ? locations.map((b) => b.id) : []
          })
        )
      } catch (error) {
        console.error('Failed to load locations:', error)
      }

      setLoading(false)
    }

    loadSessionAndUser()

    // Optional: handle logout cases live
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          router.replace('/auth/unverified')
        }
      }
    )

    return () => {
      authListener?.subscription.unsubscribe()
    }
  }, [dispatch, router])

  if (loading) return <LoadingSkeleton />
  return <>{children}</>
}
