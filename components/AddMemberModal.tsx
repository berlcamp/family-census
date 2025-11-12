/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase2 } from '@/lib/supabase/admin'
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

const roles = ['Editor', 'Importer'] as const

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

  function generatePassword(length = 12) {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?'
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map((x) => chars[x % chars.length])
      .join('')
  }

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

    const password = generatePassword()

    const { data: createdUser, error } = await supabase2.auth.admin.createUser({
      email: selectedUser.email,
      password: password,
      email_confirm: true
    })

    if (error) {
      if (error.code === 'email_exists') {
        const { data: authId, error } = await supabase.rpc(
          'get_user_id_by_email',
          {
            p_email: selectedUser.email
          }
        )

        if (error) {
          toast.error(`Error fetching user ID:, ${error.message}`)
          setLoading(false)
          return
        }

        // Check user email if exist on users table
        const { data: findUser, error: errorFindUser } = await supabase
          .from('users')
          .select()
          .eq('email', selectedUser.email)
          .maybeSingle()

        if (errorFindUser) {
          toast.error(`Error finding user:, ${errorFindUser.message}`)
          setLoading(false)
          return
        }

        // If user not exist on users table, create it
        let userId
        if (!findUser) {
          const userData = {
            user_id: authId,
            name: selectedUser.email,
            email: selectedUser.email,
            password: password,
            type: 'user',
            org_id: process.env.NEXT_PUBLIC_ORG_ID,
            address: location?.address,
            is_active: true
          }

          const { data: insertedUser, error: error2 } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single()

          if (error2) {
            toast.error(`Error inserting user into table:', ${error2.message}`)
            setLoading(false)
            return
          }
          userId = insertedUser.id
        } else {
          const { error: updateUsers } = await supabase
            .from('users')
            .update({ user_id: authId })
            .eq('email', selectedUser.email)
          if (updateUsers) {
            toast.error(`Error update user table:', ${updateUsers.message}`)
            setLoading(false)
            return
          }
          userId = findUser.id
        }

        const newData = {
          user_id: userId,
          location_id: location?.id,
          is_editor: selectedRoles.find((r) => r === 'Editor') ? true : false,
          is_importer: selectedRoles.find((r) => r === 'Importer')
            ? true
            : false
        }

        const { error: error3 } = await supabase
          .from('location_users')
          .insert(newData)

        if (error3) {
          toast.error(`Error inserting user into table:', ${error3.message}`)
          setLoading(false)
          return
        }
      } else {
        console.error('Error creating user:', error.message)
        setLoading(false)
        return
      }
    } else {
      const authId = createdUser.user?.id
      if (!authId) return

      const userData = {
        user_id: authId,
        name: selectedUser.email,
        email: selectedUser.email,
        password: password,
        type: 'user',
        org_id: process.env.NEXT_PUBLIC_ORG_ID,
        address: location?.address,
        is_active: true
      }

      const { data: insertedUser, error: error2 } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single()

      if (error2) {
        toast.error(`Error inserting user into table:', ${error2.message}`)
        setLoading(false)
        return
      }

      const newData = {
        user_id: insertedUser.id,
        location_id: location?.id,
        is_editor: selectedRoles.find((r) => r === 'Editor') ? true : false,
        is_importer: selectedRoles.find((r) => r === 'Importer') ? true : false
      }

      const { error: error3 } = await supabase
        .from('location_users')
        .insert(newData)

      if (error3) {
        toast.error(`Error inserting user into table:', ${error3.message}`)
        setLoading(false)
        return
      }
    }

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
              <div className="space-y-2 mt-4 hidden">
                <div>Assign roles:</div>
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
