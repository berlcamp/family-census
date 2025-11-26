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

  for (let spIndex = 0; spIndex < spNames.length; spIndex++) {
    const spName = spNames[spIndex]
    const spHouseholds = spGroups[spName]

    let index = 1 // reset numbering per SP

    // Flatten all families under this SP
    const tableRows: any[] = []

    // --- SP row, will appear just above the header row ---
    tableRows.push([
      {
        content: `SP: ${spName.toUpperCase()}`,
        colSpan: 4,
        styles: {
          halign: 'left',
          cellPadding: 4,
          fontStyle: 'bold',
          fontSize: 11,
          fillColor: false,
          lineWidth: 0
        }
      }
    ])
    tableRows.push(['#', 'HEAD OF FAMILY', 'MEMBERS', 'SIGNATURE'])

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
          index,
          head.toUpperCase(),
          memberList.join('\n'),
          '' // blank signature
        ])

        index++
      })
    })

    // Render table
    autoTable(doc, {
      startY: 14,
      head: [
        [
          {
            content: 'ACKNOWLEDGEMENT RECEIPT',
            colSpan: 4,
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
            colSpan: 4,
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
            colSpan: 4,
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
            colSpan: 4,
            styles: {
              halign: 'left',
              lineWidth: 0,
              fontSize: 9
            }
          }
        ]
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
