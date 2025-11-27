/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySP = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch ALL households + families + members
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

  const spNames = Object.keys(spGroups)

  let iterator = 1

  for (let spIndex = 0; spIndex < spNames.length; spIndex++) {
    const spName = spNames[spIndex]
    const spHouseholds = spGroups[spName]

    // Flatten all families under this SP
    const tableRows: any[] = []

    tableRows.push([
      iterator,
      spName.toUpperCase(),
      '',
      '', // blank signature
      iterator
    ])

    // Add families
    spHouseholds.forEach((h) => {
      const families = h.families || []

      families.forEach((f: any) => {
        const husband = f.husband_name?.trim() || null
        const wife = f.wife_name?.trim() || null
        const members = f.family_members || []

        const head = husband || wife || members[0]?.fullname || 'Unknown'

        const memberList: string[] = []
        if (husband) memberList.push(husband.toUpperCase())
        if (wife) memberList.push(wife.toUpperCase())
        members.forEach((m: any) => memberList.push(m.fullname.toUpperCase()))

        tableRows.push([
          iterator,
          head.toUpperCase(),
          memberList.join('\n'),
          '', // blank signature
          iterator
        ])

        iterator++
      })
    })

    // Render table
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
            styles: {
              halign: 'left',
              lineWidth: 0,
              fontSize: 9
            }
          }
        ],
        [
          {
            content: 'Date: _________________________',
            colSpan: 5,
            styles: {
              halign: 'left',
              lineWidth: 0,
              fontSize: 9
            }
          }
        ],
        // Normal table header
        ['#', 'Head of Family', 'Members', 'Signature', '#']
      ],

      body: tableRows,

      theme: 'plain',

      styles: {
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        fontSize: 9,
        cellPadding: 1,
        fillColor: false
      },
      didParseCell: function (data) {
        // The "Members" column — adjust as needed
        const membersColumnIndex = 2

        if (
          data.section === 'body' &&
          data.column.index === membersColumnIndex
        ) {
          data.cell.styles.fontSize = 8 // <-- set small font size here
        }
      },

      headStyles: {
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        fillColor: false,
        cellPadding: 1,
        fontStyle: 'bold'
      }
    })

    // Page break if not last SP
    if (spIndex < spNames.length - 1) {
      doc.addPage()
    }
  }

  doc.save(`${locationName}_FamilyComposition.pdf`)
}
