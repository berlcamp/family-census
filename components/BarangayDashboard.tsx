/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

export default function BarangayDashboard({ address }: { address: string }) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase.rpc('barangay_stats', {
        address_param: address
      })
      if (error) {
        console.error('Error fetching stats:', error)
        return
      }
      const normalized = (data || []).map((d: any) => ({
        barangay: d.barangay,
        households: d.households ?? 0,
        families: d.families ?? 0,
        total_registered: d.total_registered ?? 0,
        total_non_registered: d.total_non_registered ?? 0
      }))
      setData(normalized)
    }
    fetchData()
  }, [address])

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold mb-4">Barangay Dashboard ({address})</h2>

      <Card>
        <CardContent className="p-4">
          {data.length === 0 ? (
            <p className="text-center text-gray-500">No data available</p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(400, data.length * 40)} // auto-scale: 40px per barangay
            >
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 20, right: 40, left: 120, bottom: 20 }}
                barCategoryGap="20%"
                barGap={6}
              >
                <XAxis type="number" />
                <YAxis
                  dataKey="barangay"
                  type="category"
                  width={150}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="households"
                  fill="#4F46E5"
                  name="Households"
                  barSize={18}
                >
                  <LabelList
                    dataKey="households"
                    position="right"
                    fontSize={11}
                  />
                </Bar>
                <Bar
                  dataKey="families"
                  fill="#10B981"
                  name="Families"
                  barSize={18}
                >
                  <LabelList
                    dataKey="families"
                    position="right"
                    fontSize={11}
                  />
                </Bar>
                <Bar
                  dataKey="total_registered"
                  fill="#F59E0B"
                  name="Registered Members"
                  barSize={18}
                >
                  <LabelList
                    dataKey="total_registered"
                    position="right"
                    fontSize={11}
                  />
                </Bar>
                <Bar
                  dataKey="total_non_registered"
                  fill="#787878"
                  name="Non-Registered Members"
                  barSize={18}
                >
                  <LabelList
                    dataKey="total_non_registered"
                    position="right"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
