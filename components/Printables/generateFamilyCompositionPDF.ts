/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/functions/GenerateFamilyCompositionPDF.ts

import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyCompositionPDF = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch ALL families + members (NO household header)
  const { data: households, error } = await supabase
    .from('households')
    .select(
      `
      id,
      barangay, 
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
    .order('id')

  if (error || !households) {
    console.error(error)
    return
  }

  const doc = new jsPDF()

  doc.setFontSize(10)

  // Build one flattened list for entire table
  const tableRows: any[] = []
  let index = 1

  for (const h of households) {
    const families = h.families || []

    for (const f of families) {
      const husband = f.husband_name?.trim() || null
      const wife = f.wife_name?.trim() || null
      const members = f.family_members || []

      // Determine head
      const head = husband || wife || members[0]?.fullname || 'Unknown'

      // Members one-per-line
      const memberList: string[] = []
      if (husband) memberList.push(husband.toUpperCase())
      if (wife) memberList.push(wife.toUpperCase())
      members.forEach((m: any) => memberList.push(m.fullname.toUpperCase()))

      const membersString = memberList.join('\n')

      // Push to final table rows
      tableRows.push([
        index,
        head.toUpperCase(),
        membersString,
        '' // signature column
      ])

      index++
    }
  }

  // Render ONE BIG TABLE
  autoTable(doc, {
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
      ],
      // Normal table header
      ['#', 'Head of Family', 'Members', 'Signature']
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

  doc.save(`${locationName}.pdf`)
}
