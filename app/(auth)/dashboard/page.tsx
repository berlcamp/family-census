'use client'
import BarangayDashboard from '@/components/BarangayDashboard'
import Notfoundpage from '@/components/Notfoundpage'
import { useAppSelector } from '@/lib/redux/hook'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)

  if (user?.type !== 'super admin') {
    return <Notfoundpage />
  }
  return (
    <div className="w-full">
      <div className="mt-20 grid gap-4">
        {user?.address && <BarangayDashboard address={user?.address} />}
      </div>
    </div>
  )
}
