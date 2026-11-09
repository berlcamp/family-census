/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { LocationUser } from '@/types'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild
} from '@headlessui/react'
import { CheckSquare, X } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Props = {
  setRefresh: React.Dispatch<React.SetStateAction<number>>
  users: LocationUser[]
  open: boolean
  onClose: () => void
}

type User = {
  id: string
  email: string
}

const roles = ['Editor'] as const

export default function AddMemberModal({
  setRefresh,
  users,
  open,
  onClose
}: Props) {
  //
  const location = useAppSelector((state) => state.location.selectedLocation)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Search user from Supabase
  useEffect(() => {
    const fetchUsers = async () => {
      if (!query) return setResults([])

      const excludedIds = users.map((u) => u.user_id)
      const excludedFilter = excludedIds.length
        ? `(${excludedIds.join(',')})`
        : '(0)' // leave empty if no exclusion

      console.log('excludedFilter', excludedFilter)

      const { data } = await supabase
        .from('users')
        .select('id, email')
        .not('id', 'in', excludedFilter)
        .ilike('email', `%${query}%`)
        .limit(5)
      setResults(data || [])
    }

    const delay = setTimeout(() => fetchUsers(), 300)
    return () => clearTimeout(delay)
  }, [query])

  const handleSelectUser = (user: User) => {
    setSelectedUser(user)
    setQuery('')
    setResults([])
  }

  const handleInvite = async () => {
    if (!selectedUser) return
    setLoading(true)
    const email = selectedUser.email.trim().toLowerCase()

    const fail = (message: string) => {
      toast.error(message)
      setLoading(false)
    }

    // 1. Make sure a login account exists. Done on the server, because it
    //    needs the service-role key, which must never reach the browser.
    const {
      data: { session }
    } = await supabase.auth.getSession()
    const response = await fetch('/api/auth-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`
      },
      body: JSON.stringify({ email })
    })
    const result = (await response.json().catch(() => ({}))) as {
      authId?: string
      error?: string
    }
    if (!response.ok || !result.authId) {
      return fail(`Error creating account: ${result.error ?? response.statusText}`)
    }
    const authId = result.authId

    // 2. Find or create the system user row, linked to that account.
    const { data: findUser, error: errorFindUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (errorFindUser) {
      return fail(`Error finding user: ${errorFindUser.message}`)
    }

    let userId: number
    if (!findUser) {
      const { data: insertedUser, error } = await supabase
        .from('users')
        .insert({
          user_id: authId,
          name: email,
          email,
          type: 'user',
          org_id: process.env.NEXT_PUBLIC_ORG_ID,
          address: location?.address,
          is_active: true
        })
        .select('id')
        .single()
      if (error) return fail(`Error inserting user: ${error.message}`)
      userId = insertedUser.id
    } else {
      const { error } = await supabase
        .from('users')
        .update({ user_id: authId })
        .eq('id', findUser.id)
      if (error) return fail(`Error updating user: ${error.message}`)
      userId = findUser.id
    }

    // 3. Give them access to this location.
    const { error: error3 } = await supabase.from('location_users').insert({
      user_id: userId,
      location_id: location?.id,
      is_editor: selectedRoles.includes('Editor'),
      is_importer: selectedRoles.includes('Importer')
    })
    if (error3) return fail(`Error adding user to location: ${error3.message}`)

    setRefresh((prev) => prev + 1)
    setLoading(false)
    onClose()
    setSelectedUser(null)
    setSelectedRoles([])
  }

  const handleRemove = () => {
    setSelectedUser(null)
    setSelectedRoles([])
  }

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center">
          <DialogPanel className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-xl shadow-xl space-y-2 pb-10">
            <DialogTitle className="flex items-center justify-between border-b p-4">
              Add User for {location?.name}
              <button
                onClick={onClose}
                className="text-gray-500 cursor-pointer hover:text-red-500 transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </DialogTitle>

            <div className="p-4">
              {!selectedUser && (
                <div className="space-y-2">
                  <div>Email</div>
                  <Input
                    placeholder="Search or enter google email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}

              {/* Search Results */}
              {results.length > 0 && !selectedUser && (
                <div className="max-h-60 overflow-y-auto space-x-2">
                  {results.map((user) => (
                    <Button
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      variant="blue"
                      className="mt-2"
                    >
                      {user.email}
                    </Button>
                  ))}
                </div>
              )}
              <div className="text-gray-400 text-xs mt-2">
                Only Google email is allowed
              </div>

              {/* Fallback to email input */}
              {query &&
                results.length === 0 &&
                !selectedUser &&
                query.includes('@') && (
                  <Button
                    onClick={() =>
                      handleSelectUser({ id: 'new', email: query })
                    }
                    className="mt-2"
                    variant="blue"
                  >
                    Add <strong>{query}</strong>
                  </Button>
                )}

              {/* Selected User Info */}
              {selectedUser && (
                <div className="flex items-center justify-between border p-3 rounded-md bg-gray-50 dark:bg-gray-800">
                  <span className="text-sm text-gray-700 dark:text-gray-200">
                    {selectedUser.email}
                  </span>
                  <button onClick={handleRemove}>
                    <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              )}

              {/* Role Selection */}
              <div className="space-y-2 mt-4">
                <div className="text-sm">Assign roles:</div>
                <div className="flex gap-2 flex-wrap">
                  <label className="flex items-center gap-1 text-sm cursor-pointer">
                    <CheckSquare className="size-4" />
                    Viewer
                  </label>
                  {roles.map((role) => (
                    <label
                      key={role}
                      className="flex items-center gap-1 text-sm cursor-pointer"
                    >
                      <Input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <div className="text-gray-400 text-xs italic font-light mt-1 hidden">
                <div>Viewer can only view households and residents</div>
                <div>Editor can add or edit households/residents</div>
                <div>Importer can add or bulk import residents</div>
              </div>

              <div className="flex justify-end mt-2">
                <Button
                  onClick={handleInvite}
                  disabled={!selectedUser || loading}
                >
                  {loading ? 'Adding...' : 'Add User'}
                </Button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </Transition>
  )
}
