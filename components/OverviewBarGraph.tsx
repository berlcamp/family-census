/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

export default function OverviewBarGraph({
  locationId
}: {
  locationId?: number
}) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    const fetchStats = async () => {
      const { data, error } = await supabase.rpc('barangay_overview_stats', {
        location_id_param: locationId
      })
      if (error) {
        console.error('Error fetching overview stats:', error)
        return
      }
      setData(data || [])
    }
    fetchStats()
  }, [locationId])

  return (
    <div className="bg-white">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 40, left: 40, bottom: 20 }}
          barGap={12}
          barSize={40}
        >
          <XAxis dataKey="barangay" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="total_households" fill="#4F46E5" name="Households" />
          <Bar dataKey="total_families" fill="#10B981" name="Families" />
          <Bar
            dataKey="total_voters"
            fill="#F59E0B"
            name="Registered Members"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
