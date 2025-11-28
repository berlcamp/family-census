/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySP = async (
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
        sp,
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

    let spFamily: any = null
    const otherFamilies: any[] = []

    // Separate SP family and other families
    spHouseholds.forEach((h) => {
      const families = h.families || []

      families.forEach((f: any) => {
        if (f.sp?.trim() === spName) {
          spFamily = f // this is the SP-assigned family
        } else {
          // Only include families that do NOT have an SP
          // or their SP does not match this SP row
          if (!f.sp || f.sp.trim() !== spName) {
            otherFamilies.push(f)
          }
        }
      })
    })

    // Build composition of SP family's MEMBERS column
    const spMemberList: string[] = []
    if (spFamily) {
      const husband = spFamily.husband_name?.trim() || null
      const wife = spFamily.wife_name?.trim() || null
      const members = spFamily.family_members || []

      if (husband) spMemberList.push(husband.toUpperCase())
      if (wife) spMemberList.push(wife.toUpperCase())
      members.forEach((m: any) => spMemberList.push(m.fullname.toUpperCase()))
    }

    // SP ROW
    tableRows.push({
      iterator,
      name: spName.toUpperCase(),
      members: spMemberList.join('\n'),
      signature: '',
      ap: iterator,
      isSP: true
    })
    iterator++

    // Sort remaining families (excluding SP family)
    const sortedFamilies = otherFamilies
      .map((f) => {
        const husband = f.husband_name?.trim() || ''
        const wife = f.wife_name?.trim() || ''
        const members = f.family_members || []
        const head = husband || wife || members[0]?.fullname || 'Unknown'

        return { ...f, head }
      })
      .sort((a, b) => a.head.localeCompare(b.head))

    // Display remaining families
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
    head: [
      [
        {
          content: 'ACKNOWLEDGEMENT RECEIPT',
          colSpan: 5,
          styles: {
            halign: 'center',
            cellPadding: 0,
            lineWidth: 0,
            fontStyle: 'bold',
            fontSize: 10
          }
        }
      ],
      [
        {
          content: `${locationName}, ${locationAddress}, MISAMIS OCCIDENTAL`,
          colSpan: 5,
          styles: {
            halign: 'center',
            cellPadding: 0,
            lineWidth: 0,
            fontSize: 9
          }
        }
      ],
      [
        {
          content: 'Activity: _________________________',
          colSpan: 5,
          styles: { halign: 'left', lineWidth: 0, fontSize: 9 }
        }
      ],
      [
        {
          content: 'Date: _________________________',
          colSpan: 5,
          styles: { halign: 'left', lineWidth: 0, fontSize: 9 }
        }
      ],
      ['#', 'Head of Family', 'Members', 'Signature', '#']
    ],
    body: tableRows.map((r) => [
      r.iterator,
      r.name,
      r.members,
      r.signature,
      r.ap
    ]),
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
      // if (!row.isSP && data.column.index === 2) data.cell.styles.fontSize = 7
      if (row.isSP && data.column.index === 1)
        data.cell.styles.fontStyle = 'bold'
      if (data.column.index === 2) data.cell.styles.fontSize = 7
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
