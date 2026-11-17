'use client'

import BarangayChart from '@/components/dashboard/BarangayChart'
import StatTiles from '@/components/dashboard/StatTiles'
import StatsTable, { Column } from '@/components/dashboard/StatsTable'
import {
  BarangayStat,
  MunicipalityStat,
  useBarangayStats,
  useMunicipalityStats
} from '@/components/dashboard/useDashboardData'
import Notfoundpage from '@/components/Notfoundpage'
import { useAppSelector } from '@/lib/redux/hook'
import { useMemo } from 'react'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)
  const isAdmin = user?.type === 'super admin' || user?.type === 'province admin'
  const address = isAdmin ? user?.address ?? null : null
  const isOzamiz = address === 'OZAMIZ CITY'

  // One request each; the tiles, chart and table share the barangay data.
  const barangays = useBarangayStats(address)
  const municipalities = useMunicipalityStats(user?.type === 'province admin')

  const tiles = useMemo(() => {
    const sum = (k: keyof BarangayStat) =>
      barangays.data.reduce((s, d) => s + Number(d[k] ?? 0), 0)
    return [
      { label: 'Barangays', value: barangays.data.length },
      { label: 'Households', value: sum('households') },
      { label: 'Families', value: sum('families') },
      { label: 'Registered members', value: sum('total_registered') },
      {
        label: 'Families all not registered',
        value: sum('total_non_registered'),
        hint: 'Nobody in the family is a registered voter'
      }
    ]
  }, [barangays.data])

  const barangayColumns: Column<BarangayStat & Record<string, string | number>>[] = [
    { key: 'barangay', label: 'Barangay' },
    { key: 'households', label: 'Households', numeric: true },
    { key: 'families', label: 'Families', numeric: true },
    { key: 'total_non_registered', label: 'Families (all NR)', numeric: true },
    isOzamiz
      ? { key: 'total_ap_membership_false', label: 'No AP', numeric: true }
      : { key: 'sps', label: 'SPs', numeric: true }
  ]

  const municipalityColumns: Column<MunicipalityStat & Record<string, string | number>>[] = [
    { key: 'address', label: 'Municipality / City' },
    { key: 'total_households', label: 'Households', numeric: true },
    { key: 'total_families', label: 'Families', numeric: true },
    { key: 'total_households_all_nr', label: 'All-NR households', numeric: true },
    { key: 'total_all_nr_families', label: 'All-NR families', numeric: true },
    ...(isOzamiz
      ? [{ key: 'total_no_ap_families' as const, label: 'No AP families', numeric: true }]
      : [])
  ]

  if (!user) return null
  if (!isAdmin) return <Notfoundpage />

  return (
    <div className="w-full space-y-4 p-4 pt-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
          {address} Dashboard
        </h1>
        <p className="text-sm text-gray-500">Census encoding progress per barangay</p>
      </div>

      <StatTiles tiles={tiles} loading={barangays.loading} />

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <BarangayChart data={barangays.data} loading={barangays.loading} />
        </div>
        <div className="xl:col-span-2">
          <StatsTable
            title="Per barangay"
            rows={barangays.data as (BarangayStat & Record<string, string | number>)[]}
            columns={barangayColumns}
            loading={barangays.loading}
            error={barangays.error}
            maxHeight="max-h-[720px]"
          />
        </div>
      </div>

      {user.type === 'province admin' && (
        <div className="xl:w-3/5">
          <StatsTable
            title="Per municipality / city"
            rows={municipalities.data as (MunicipalityStat & Record<string, string | number>)[]}
            columns={municipalityColumns}
            loading={municipalities.loading}
            error={municipalities.error}
          />
        </div>
      )}
    </div>
  )
}
