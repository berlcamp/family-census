/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import { Member } from '@/types'
import * as XLSX from 'xlsx'

export async function DownloadHouseholdExcel(locationId: number) {
  // 1️⃣ Fetch households with families + members
  const { data, error } = await supabase
    .from('households')
    .select(
      `
      id,
      name,
      families (
        id,
        husband_name,
        wife_name,
        family_members (
          fullname,
          relation
        )
      )
    `
    )
    .eq('location_id', locationId)

  if (error) {
    console.error(error)
    alert('Error fetching households')
    return
  }

  const rows: any[] = []
  let householdCounter = 1

  // 2️⃣ Build structured rows
  for (const household of data) {
    const householdCode = `H${householdCounter}`

    let familyLetterIndex = 0

    for (const family of household.families || []) {
      const familyLetter = String.fromCharCode(65 + familyLetterIndex) // A, B, C...

      // Collect all member names
      const members = family.family_members?.map((m) => m.fullname) || []

      // Build row
      const row: any = {
        Household: householdCode, // Column A
        Family: familyLetter, // Column B
        Husband: family.husband_name, // Column C
        Wife: family.wife_name // Column D
      }

      // Add members to columns E, F, G...
      members.forEach((memberName: Member, index: number) => {
        row[`Member ${index + 1}`] = memberName
      })

      rows.push(row)
      familyLetterIndex++
    }

    householdCounter++
  }

  // 3️⃣ Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows)

  // 4️⃣ Auto-fit column widths
  const columnWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(key.length, 15)
  }))
  worksheet['!cols'] = columnWidths

  // 5️⃣ Create workbook and save
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Households')

  XLSX.writeFile(workbook, `households_location_${locationId}.xlsx`)
}
