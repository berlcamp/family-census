'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

interface BarangayStats {
  address: string
  total_households: number
  total_families: number
  total_all_nr_families: number
}

export default function DashboardProvinceStats() {
  const [stats, setStats] = useState<BarangayStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadStats() {
      const { data, error } = await supabase.rpc(
        'dashboard_counts_per_barangay'
      )

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setStats(data ?? [])
      setLoading(false)
    }

    loadStats()
  }, [])

  if (loading) {
    return <p className="text-center text-sm text-gray-500">Loading stats...</p>
  }

  if (error) {
    return <p className="text-center text-sm text-red-500">{error}</p>
  }

  // Compute totals across all barangays
  const totalHouseholds = stats.reduce(
    (sum, b) => sum + (b.total_households ?? 0),
    0
  )
  const totalFamilies = stats.reduce(
    (sum, b) => sum + (b.total_families ?? 0),
    0
  )
  const totalAllNR = stats.reduce(
    (sum, b) => sum + (b.total_all_nr_families ?? 0),
    0
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left">Municipality/City</th>
            <th className="border px-2 py-1 text-right">Households</th>
            <th className="border px-2 py-1 text-right">Families</th>
            <th className="border px-2 py-1 text-right">Families (ALL NR)</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((b, idx) => (
            <tr key={idx}>
              <td className="border px-2 py-1">{b.address}</td>
              <td className="border px-2 py-1 text-right">
                {b.total_households.toLocaleString()}
              </td>
              <td className="border px-2 py-1 text-right">
                {b.total_families.toLocaleString()}
              </td>
              <td className="border px-2 py-1 text-right">
                {b.total_all_nr_families.toLocaleString()}
              </td>
            </tr>
          ))}

          {/* TOTAL ROW */}
          <tr className="font-bold bg-gray-100">
            <td className="border px-2 py-1">TOTAL</td>
            <td className="border px-2 py-1 text-right">
              {totalHouseholds.toLocaleString()}
            </td>
            <td className="border px-2 py-1 text-right">
              {totalFamilies.toLocaleString()}
            </td>
            <td className="border px-2 py-1 text-right">
              {totalAllNR.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
