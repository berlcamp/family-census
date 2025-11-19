'use client'

import { useAppSelector } from '@/lib/redux/hook'
import { addList } from '@/lib/redux/locationsSlice'
import { updateUser } from '@/lib/redux/userSlice'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import HeaderDropdown from './HeaderDropdownMenu'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { SidebarTrigger } from './ui/sidebar'

// Example list of barangays / addresses (replace with dynamic source if needed)
const addresses = [
  'SAPANG DALAGA',
  'LOPEZ JAENA',
  'BONIFACIO',
  'ALORAN',
  'CALAMBA',
  'PLARIDEL',
  'JIMENEZ',
  'CLARIN',
  'PANAON',
  'DON VICTORIANO CHIONGBIAN',
  'TUDELA',
  'BALIANGAO',
  'SINACABAN',
  'CITY OF OROQUIETA',
  'OZAMIZ CITY',
  'CONCEPCION',
  'CITY OF TANGUB'
]

export default function StickyHeader() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('') // ✅ add state for search input

  const router = useRouter()
  const dispatch = useDispatch()

  const user = useAppSelector((state) => state.user.user)

  const handleSearch = (term: string) => {
    if (!term.trim()) return
    setSearchTerm('')
    router.push(`/search?q=${encodeURIComponent(term)}`)
  }

  async function updateUserAddress(address: string) {
    if (!user) return

    try {
      // Update in database
      const { error } = await supabase
        .from('users')
        .update({ address })
        .eq('id', user?.system_user_id)

      if (error) throw error

      // Update locations list
      const { data: locations, error: error2 } = await supabase
        .from('locations')
        .select('*')
        .eq('address', address)
        .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)
        .order('id', { ascending: true })

      if (error2) throw error2

      // Update locations state
      dispatch(addList(locations))

      // Update Redux user state
      dispatch(updateUser({ address }))

      console.log(`User address updated to ${address}`)
      return true
    } catch (err) {
      console.error('Error updating address:', err)
      alert('Failed to update your address. Please try again.')
      return false
    }
  }
  return (
    <header className="fixed w-full top-0 z-40 bg-[#2e2e30] border-b border-[#424244] p-2 flex justify-start items-center gap-4">
      <SidebarTrigger />

      {/* Left section: Logo */}
      <div className="flex items-center gap-4">
        <div className="text-white font-semibold flex items-center">
          <span>Family Census App</span>
        </div>
      </div>

      {/* Search Input */}
      {(user?.type === 'super admin' || user?.type === 'province admin') && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSearch(searchTerm)
          }}
        >
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} // ✅ keep state in sync
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSubmitting) {
                e.preventDefault()
                setIsSubmitting(true)
                handleSearch(searchTerm)
                e.currentTarget.blur() // 👈 unfocus after submit
                setTimeout(() => setIsSubmitting(false), 1000) // cooldown
              }
            }}
            className="w-full bg-[#565557] border-none focus-visible:ring-1 focus:ring-white text-white"
          />
        </form>
      )}

      <div className="flex-1"></div>

      {/* Address switch */}
      {user?.type === 'province admin' && (
        <div className="text-white">
          {user?.type === 'province admin' && (
            <Select
              value={user.address || ''} // <-- show current user.address
              onValueChange={async (value) => {
                await updateUserAddress(value)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a Address" />
              </SelectTrigger>
              <SelectContent>
                {addresses.map((address) => (
                  <SelectItem key={address} value={address}>
                    {address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Right section: Settings dropdown */}
      <HeaderDropdown />
    </header>
  )
}
