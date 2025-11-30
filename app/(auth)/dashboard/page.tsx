'use client'

import BarangayDashboard from '@/components/BarangayDashboard'
import BarangayDashboardList from '@/components/BarangayDashboardList'
import DashboardProvinceStats from '@/components/DashboardProvinceStats'
import DashboardStats from '@/components/DashboardStats'
import Notfoundpage from '@/components/Notfoundpage'
import { useAppSelector } from '@/lib/redux/hook'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)

  if (user?.type === 'user') {
    return <Notfoundpage />
  }

  if (user?.type === 'super admin') {
    return (
      <div className="w-full">
        <div className="mt-20 space-y-10 p-4">
          {user?.address && (
            <>
              <h1>{user?.address} Dashboard</h1>
              <DashboardStats address={user?.address} />
              {user?.address && (
                <div className="space-y-10">
                  <BarangayDashboard address={user?.address} />
                  <BarangayDashboardList address={user?.address} />
                </div>
              )}
            </>
          )}
        </div>
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
        </div>

        {/* Render dashboard for selected address */}
        <div className="my-8">
          {user?.address && (
            <div className="space-y-4">
              <DashboardStats address={user?.address} />
              <BarangayDashboard address={user?.address} />
              <div className="lg:w-2/3">
                <BarangayDashboardList address={user?.address} />
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-2/3">
          {user?.address && <DashboardProvinceStats address={user?.address} />}
        </div>
      </div>
    )
  }
}
