/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function BarangayDashboardList({
  address
}: {
  address: string
}) {
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
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          {data.length === 0 ? (
            <p className="text-center text-gray-500">No data available</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="px-2">Barangay</th>
                  <th className="px-2">Households</th>
                  <th className="px-2">Families</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d, idx) => (
                  <tr key={idx}>
                    <td className="px-2">{d.barangay}</td>
                    <td className="px-2">
                      {new Intl.NumberFormat().format(d.households)}
                    </td>
                    <td className="px-2">
                      {new Intl.NumberFormat().format(d.families)}
                    </td>
                  </tr>
                ))}
                {/* TOTAL ROW */}
                <tr className="font-bold border-t">
                  <td className="px-2">TOTAL</td>
                  <td className="px-2">
                    {new Intl.NumberFormat().format(
                      data.reduce((sum, d) => sum + d.households, 0)
                    )}
                  </td>
                  <td className="px-2">
                    {new Intl.NumberFormat().format(
                      data.reduce((sum, d) => sum + d.families, 0)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
