'use client'

import BarangayDashboard from '@/components/BarangayDashboard'
import Notfoundpage from '@/components/Notfoundpage'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppSelector } from '@/lib/redux/hook'
import { useState } from 'react'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)
  const [selectedAddress, setSelectedAddress] = useState<string>('')

  // Example list of barangays / addresses (replace with dynamic source if needed)
  const addresses = ['TUDELA', 'OZAMIZ CITY']

  if (user?.type === 'user') {
    return <Notfoundpage />
  }

  if (user?.type === 'super admin') {
    return (
      <div className="w-full">
        {' '}
        <div className="mt-20 grid gap-4">
          {' '}
          {user?.address && <BarangayDashboard address={user?.address} />}{' '}
        </div>{' '}
      </div>
    )
  }

  if (user?.type === 'province admin') {
    return (
      <div className="w-full mt-20 p-4">
        <div className="max-w-md mx-auto">
          {/* <h1 className="text-2xl font-semibold text-gray-800 mb-4">
          Barangay Dashboard
        </h1> */}

          {/* Address dropdown */}
          <Select onValueChange={(value) => setSelectedAddress(value)}>
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
        </div>

        {/* Render dashboard for selected address */}
        <div className="mt-8">
          {selectedAddress ? (
            <BarangayDashboard address={selectedAddress} />
          ) : (
            <div className="text-gray-500 text-center mt-8">
              Please select a address to view its dashboard.
            </div>
          )}
        </div>
      </div>
    )
  }
}
