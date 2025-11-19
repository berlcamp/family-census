'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { Card, CardContent } from './ui/card'

export default function DashboardStats({ address }: { address: string }) {
  const [stats, setStats] = useState({
    totalHouseholds: 0,
    totalFamilies: 0,
    totalAllNR: 0
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadStats() {
      const { data, error } = await supabase.rpc('dashboard_counts', {
        address_param: address
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const row = data?.[0]

      setStats({
        totalHouseholds: row?.total_households ?? 0,
        totalFamilies: row?.total_families ?? 0,
        totalAllNR: row?.total_all_nr_families ?? 0
      })

      setLoading(false)
    }

    loadStats()
  }, [])

  const boxes = [
    { label: 'Total Households', value: stats.totalHouseholds },
    { label: 'Total Families', value: stats.totalFamilies },
    { label: 'Families (ALL NR)', value: stats.totalAllNR }
  ]

  if (loading) {
    return <p className="text-center text-sm text-gray-500">Loading stats...</p>
  }

  if (error) {
    return <p className="text-center text-sm text-red-500">{error}</p>
  }

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4">
      {boxes.map((box, idx) => (
        <Card
          key={idx}
          className="rounded-2xl shadow p-4 flex items-center justify-center"
        >
          <CardContent className="text-center p-2">
            <p className="text-xs text-gray-500">{box.label}</p>
            <h2 className="text-3xl font-bold mt-1">{box.value}</h2>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
