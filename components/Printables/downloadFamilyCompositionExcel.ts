/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/functions/DownloadFamilyCompositionExcel.ts

import { supabase } from '@/lib/supabase/client'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

export const downloadFamilyCompositionExcel = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch households + families + members
  const { data: households, error } = await supabase
    .from('households')
    .select(
      `
      families (
        husband_name,
        is_husband_ap_member,
        wife_name,
        is_wife_ap_member,
        family_members (
          fullname,
          is_ap_member
        )
      )
    `
    )
    .eq('barangay', locationName)
    .eq('address', locationAddress)
    .order('id')

  if (error || !households) {
    console.error(error)
    return
  }

  const wsData: any[] = []
  let index = 1

  households.forEach((h: any) => {
    const families = h.families || []

    families.forEach((f: any) => {
      const husband = f.husband_name?.trim() || null
      const wife = f.wife_name?.trim() || null
      const members = f.family_members || []

      const head = husband || wife || members[0]?.fullname || 'Unknown'

      // Build members and AP
      const memberLines: string[] = []
      const apLines: string[] = []

      if (husband) {
        memberLines.push(husband.toUpperCase())
        apLines.push(f.is_husband_ap_member ? 'Yes' : 'No')
      }

      if (wife) {
        memberLines.push(wife.toUpperCase())
        apLines.push(f.is_wife_ap_member ? 'Yes' : 'No')
      }

      members.forEach((m: any) => {
        memberLines.push(m.fullname.toUpperCase())
        apLines.push(m.is_ap_member ? 'Yes' : 'No')
      })

      wsData.push([
        index,
        head.toUpperCase(),
        memberLines.join('\n'),
        apLines.join('\n')
      ])
      index++
    })
  })

  // Add header row
  wsData.unshift(['#', 'Head of Family', 'Members', 'AP'])

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Optional: set column widths
  ws['!cols'] = [
    { wch: 5 }, // # column
    { wch: 25 }, // Head of Family
    { wch: 40 }, // Members
    { wch: 10 } // AP
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Families')

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  saveAs(blob, `${locationName}_FamilyComposition.xlsx`)
}
