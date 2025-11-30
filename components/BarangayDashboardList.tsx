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
        sps: d.sps ?? 0,
        families: d.families ?? 0,
        total_registered: d.total_registered ?? 0,
        total_non_registered: d.total_non_registered ?? 0,
        all_c: d.all_c ?? 0,
        all_c_ap: d.all_c_ap ?? 0,
        total_ap_membership_true: d.total_ap_membership_true ?? 0,
        total_ap_membership_false: d.total_ap_membership_false ?? 0
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
            <table className="w-full border-collapse border border-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border px-2 py-1 text-left">Barangay</th>
                  <th className="border px-2 py-1 text-right">Households</th>
                  <th className="border px-2 py-1 text-right">Families</th>
                  <th className="border px-2 py-1 text-right">
                    Families (ALL NR)
                  </th>
                  {address !== 'OZAMIZ CITY' && (
                    <th className="border px-2 py-1 text-right">SPs</th>
                  )}
                  {address === 'OZAMIZ CITY' && (
                    <>
                      <th className="border px-2 py-1 text-right">No AP</th>
                      <th className="border px-2 py-1 text-right">All C</th>
                      <th className="border px-2 py-1 text-right">
                        All C w/ AP
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((d, idx) => (
                  <tr key={idx}>
                    <td className="border px-2 py-1">{d.barangay}</td>
                    <td className="border px-2 py-1">
                      {new Intl.NumberFormat().format(d.households)}
                    </td>
                    <td className="border px-2 py-1">
                      {new Intl.NumberFormat().format(d.families)}
                    </td>
                    <td className="border px-2 py-1">
                      {new Intl.NumberFormat().format(d.total_non_registered)}
                    </td>
                    {address !== 'OZAMIZ CITY' && (
                      <td className="border px-2 py-1">
                        {new Intl.NumberFormat().format(d.sps)}
                      </td>
                    )}
                    {address === 'OZAMIZ CITY' && (
                      <>
                        <td className="border px-2 py-1">
                          {new Intl.NumberFormat().format(
                            d.total_ap_membership_false
                          )}
                        </td>
                        <td className="border px-2 py-1">
                          {new Intl.NumberFormat().format(d.all_c)}
                        </td>
                        <td className="border px-2 py-1">
                          {new Intl.NumberFormat().format(d.all_c_ap)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {/* TOTAL ROW */}
                <tr className="font-bold border-t">
                  <td className="border px-2 py-1">TOTAL</td>
                  <td className="border px-2 py-1">
                    {new Intl.NumberFormat().format(
                      data.reduce((sum, d) => sum + d.households, 0)
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {new Intl.NumberFormat().format(
                      data.reduce((sum, d) => sum + d.families, 0)
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {new Intl.NumberFormat().format(
                      data.reduce((sum, d) => sum + d.total_non_registered, 0)
                    )}
                  </td>
                  {address !== 'OZAMIZ CITY' && (
                    <td className="border px-2 py-1">
                      {new Intl.NumberFormat().format(
                        data.reduce((sum, d) => sum + d.sps, 0)
                      )}
                    </td>
                  )}
                  {address === 'OZAMIZ CITY' && (
                    <>
                      <td className="border px-2 py-1">
                        {new Intl.NumberFormat().format(
                          data.reduce(
                            (sum, d) => sum + d.total_ap_membership_false,
                            0
                          )
                        )}
                      </td>
                      <td className="border px-2 py-1">
                        {new Intl.NumberFormat().format(
                          data.reduce((sum, d) => sum + d.all_c, 0)
                        )}
                      </td>
                      <td className="border px-2 py-1">
                        {new Intl.NumberFormat().format(
                          data.reduce((sum, d) => sum + d.all_c_ap, 0)
                        )}
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
