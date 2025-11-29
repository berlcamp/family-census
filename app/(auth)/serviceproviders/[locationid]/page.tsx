/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import NoAccess from '@/components/NoAccess'
import VerticalMenu from '@/components/VerticalMenu'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import { clearLocation, setLocation } from '@/lib/redux/locationSlice'
import { supabase } from '@/lib/supabase/client'
import { ServiceProvider } from '@/types'
import { useParams } from 'next/navigation'

import { useEffect, useState } from 'react'

export default function ServiceProvidersPage() {
  const { locationid } = useParams<{ locationid: string }>()
  const locationIdNum = Number(locationid)
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>(
    []
  )
  const [userHasAccess, setUserHasAccess] = useState(true)
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [spToDelete, setSpToDelete] = useState<ServiceProvider | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const dispatch = useAppDispatch()
  const location = useAppSelector((state) => state.location.selectedLocation)
  const user = useAppSelector((state) => state.user.user)

  useEffect(() => {
    if (location) {
      fetchSPs()
    }
  }, [location])

  const fetchSPs = async () => {
    setLoading(true)

    // Fetch SPs
    const { data, error } = await supabase
      .from('service_providers')
      .select(
        `
      *,
      households (
        families (
          family_members (
            id
          )
        )
      )
    `
      )
      .eq('location_id', location?.id)
      .order('name', { ascending: true })

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    // Compute total members per SP
    const spWithCounts = (data || []).map((sp: ServiceProvider) => {
      const total = sp.households.length ?? 0

      return { ...sp, totalMembers: total }
    })

    setServiceProviders(spWithCounts)
    setLoading(false)
  }

  const addSP = async () => {
    if (!newName.trim()) return
    const { error } = await supabase
      .from('service_providers')
      .insert({ name: newName.trim(), location_id: location?.id })
      .select()
    if (error) console.error(error)
    else {
      setNewName('')
      fetchSPs()
    }
  }

  const updateSP = async (id: number) => {
    if (!editName.trim()) return
    const { error } = await supabase
      .from('service_providers')
      .update({ name: editName.trim() })
      .eq('id', id)
      .select()
    if (error) console.error(error)
    else {
      setEditId(null)
      setEditName('')
      fetchSPs()
    }
  }

  const confirmDeleteSP = (sp: ServiceProvider) => {
    setSpToDelete(sp)
    setConfirmOpen(true)
  }

  const handleDeleteSP = async () => {
    if (!spToDelete) return
    setDeleteLoading(true)

    // Check if any households are using this SP
    const { data: households, error } = await supabase
      .from('households')
      .select('id')
      .eq('sp_id', spToDelete.id)
      .limit(1)

    if (error) {
      console.error(error)
      setDeleteLoading(false)
      return
    }

    if (households && households.length > 0) {
      alert(
        'Cannot delete. Some households are assigned to this service provider. Remove this SP from household first.'
      )
      setDeleteLoading(false)
      setConfirmOpen(false)
      return
    }

    const { error: delError } = await supabase
      .from('service_providers')
      .delete()
      .eq('id', spToDelete.id)

    if (delError) console.error(delError)
    setDeleteLoading(false)
    setConfirmOpen(false)
    setSpToDelete(null)
    fetchSPs()
  }

  useEffect(() => {
    const checkAccess = async () => {
      const { data: locationUser } = await supabase
        .from('location_users')
        .select()
        .eq('location_id', location?.id)
        .eq('user_id', user?.system_user_id)
        .single()
      if (locationUser) {
        setUserHasAccess(!locationUser.is_disabled)
      }
    }
    if (user?.type === 'user' && location) {
      checkAccess()
    }
  }, [location, user])

  useEffect(() => {
    if (!locationIdNum) return

    dispatch(clearLocation()) // 👈 Clear old location when URL changes

    const fetchData = async () => {
      setLoading(true)

      // Super admin
      if (user?.type === 'super admin' || user?.type === 'province admin') {
        const { data, error } = await supabase
          .from('locations')
          .select('*,service_providers(*)')
          .eq('address', user?.address)
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
  }, [
    dispatch,
    locationIdNum,
    user?.address,
    user?.admin,
    user?.system_user_id
  ])

  if (user?.type === 'user' && !userHasAccess) {
    return <NoAccess />
  }

  return (
    <div className="w-full">
      <div className="app__title flex">
        <h1 className="text-xl font-semibold flex-1">{location?.name}</h1>
      </div>

      <VerticalMenu activeTab="serviceproviders" />

      <div className="my-4 p-4 text-sm">
        {/* Add new SP */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New service provider - LASTNAME, FIRSTNAME MIDDLENAME"
            className="border p-2 rounded flex-1"
          />
          <button
            onClick={addSP}
            className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700"
          >
            Add
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="w-full border-collapse border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">ID</th>
                <th className="border p-2 text-left">Name</th>
                <th className="border p-2 text-left">Total Households</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {serviceProviders.map((sp) => (
                <tr key={sp.id}>
                  <td className="border p-2">{sp.id}</td>
                  <td className="border p-2">
                    {editId === sp.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="border p-1 rounded w-full"
                      />
                    ) : (
                      sp.name
                    )}
                  </td>
                  <td className="border p-2">{sp.totalMembers || 0}</td>

                  <td className="border p-2 flex gap-2 justify-center">
                    {editId === sp.id ? (
                      <>
                        <button
                          onClick={() => updateSP(sp.id)}
                          className="bg-green-600 text-white px-2 rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditId(null)
                            setEditName('')
                          }}
                          className="bg-gray-400 text-white px-2 rounded hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditId(sp.id)
                            setEditName(sp.name)
                          }}
                          className="bg-yellow-500 text-white px-2 rounded hover:bg-yellow-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDeleteSP(sp)}
                          className="bg-red-600 text-white px-2 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {serviceProviders.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center p-2">
                    No service providers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${spToDelete?.name}"?`}
        description="This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteSP}
        loading={deleteLoading}
      />
    </div>
  )
}
