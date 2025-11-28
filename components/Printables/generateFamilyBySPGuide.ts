/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySPGuide = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  const { data: households, error } = await supabase
    .from('households')
    .select(
      `
      id,
      sp,
      families (
        id,
        husband_name,
        wife_name,
        family_members (
          fullname,
          relation,
          is_registered
        )
      )
    `
    )
    .eq('barangay', locationName)
    .eq('address', locationAddress)
    .order('sp', { ascending: true })
    .order('id', { ascending: true })

  if (error || !households) {
    console.error(error)
    return
  }

  const doc = new jsPDF({
    unit: 'mm',
    format: 'letter',
    orientation: 'portrait'
  })
  doc.setFontSize(10)

  // Group households by SP
  const spGroups: Record<string, any[]> = {}
  households.forEach((h: any) => {
    const spName = h.sp?.trim() || 'UNASSIGNED'
    if (!spGroups[spName]) spGroups[spName] = []
    spGroups[spName].push(h)
  })

  // Sort SP names alphabetically
  const spNames = Object.keys(spGroups).sort((a, b) => a.localeCompare(b))

  const tableRows: any[] = []
  let iterator = 1

  spNames.forEach((spName) => {
    const spHouseholds = spGroups[spName]

    // SP row
    tableRows.push({
      iterator: '',
      name: `${spName.toUpperCase()}`,
      members: '',
      signature: '',
      ap: iterator,
      isSP: true
    })

    // Sort families alphabetically by head of family
    const sortedFamilies: any[] = []
    spHouseholds.forEach((h) => {
      const families = h.families || []
      families.forEach((f: any) => {
        const husband = f.husband_name?.trim() || ''
        const wife = f.wife_name?.trim() || ''
        const head =
          husband || wife || f.family_members[0]?.fullname || 'Unknown'
        sortedFamilies.push({ ...f, head })
      })
    })
    sortedFamilies.sort((a, b) => a.head.localeCompare(b.head))

    // Add sorted families to tableRows
    sortedFamilies.forEach((f: any) => {
      const husband = f.husband_name?.trim() || null
      const wife = f.wife_name?.trim() || null
      const members = f.family_members || []

      const head = husband || wife || members[0]?.fullname || 'Unknown'

      const memberList: string[] = []
      if (husband) memberList.push(husband.toUpperCase())
      if (wife) memberList.push(wife.toUpperCase())
      members.forEach((m: any) => memberList.push(m.fullname.toUpperCase()))

      tableRows.push({
        iterator,
        name: head.toUpperCase(),
        members: memberList.join('\n'),
        signature: '',
        ap: iterator,
        isSP: false
      })
      iterator++
    })
  })

  // Render table (same as your existing autoTable code)
  autoTable(doc, {
    startY: 14,
    head: [['#', 'Head of Family', 'Members']],
    body: tableRows.map((r) => [r.iterator, r.name, r.members]),
    theme: 'plain',
    styles: {
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      fontSize: 9,
      cellPadding: 1,
      fillColor: false
    },
    columnStyles: { 2: { cellWidth: 70 }, 3: { cellWidth: 35 } },
    didParseCell: function (data) {
      const row = tableRows[data.row.index]
      // if (row.isSP && data.column.index === 1) {
      //   data.cell.styles.fontStyle = 'bold'
      //   data.cell.styles.fontSize = 10
      // }
      if (!row.isSP && data.column.index === 2) data.cell.styles.fontSize = 7
      if (row.isSP && data.column.index === 1)
        data.cell.styles.fontStyle = 'bold'
    },
    headStyles: {
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      fillColor: false,
      cellPadding: 1,
      fontStyle: 'bold'
    }
  })

  doc.save(`${locationName}_FamilyComposition.pdf`)
}
