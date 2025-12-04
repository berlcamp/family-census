/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySPD2 = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch households with SP info
  const { data: households, error } = await supabase
    .from('households')
    .select(
      `
      id,
      sp_id,
      service_providers (
        id,
        name
      ),
      families (
        id,
        all_nr,
        husband_name,
        wife_name,
        asenso_husband,
        asenso_wife,
        family_members (
          fullname,
          asenso,
          relation,
          is_registered
        )
      )
    `
    )
    .eq('barangay', locationName)
    .eq('address', locationAddress)
    .not('sp_id', 'is', null) // <-- exclude households with no SP
    .order('sp_id', { ascending: true })
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

  // Group households by SP name
  const spGroups: Record<string, any[]> = {}
  households.forEach((h: any) => {
    const spName = h.service_providers?.name?.trim() || 'UNASSIGNED'
    if (!spGroups[spName]) spGroups[spName] = []
    spGroups[spName].push(h)
  })

  const spNames = Object.keys(spGroups).sort((a, b) => a.localeCompare(b))
  const tableRows: any[] = []
  let iterator = 1

  spNames.forEach((spName) => {
    const spHouseholds = spGroups[spName]

    const sortedFamilies: any[] = []
    spHouseholds.forEach((h) => {
      const families = h.families || []
      families.forEach((f: any) => {
        const hasAsensoHusband = !!f.asenso_husband
        const hasAsensoWife = !!f.asenso_wife
        const hasAsensoMember = !!f.family_members?.[0]?.asenso

        const allNr = f.all_nr === true

        // EXCLUDE if all_nr = true
        if (allNr) return

        // Only push if ANY of the conditions is true
        const isValidFamily =
          hasAsensoHusband || hasAsensoWife || hasAsensoMember

        if (!isValidFamily) return // skip completely

        const husband = f.husband_name?.trim() || ''
        const wife = f.wife_name?.trim() || ''
        const head = husband || wife || f.family_members[0]?.fullname || null

        if (!head || head.trim().toUpperCase() === 'UNKNOWN') return // exclude unknown heads

        sortedFamilies.push({ ...f, head })
      })
    })

    // Skip SP if it has no families
    if (sortedFamilies.length === 0) return

    sortedFamilies.sort((a, b) => a.head.localeCompare(b.head))

    sortedFamilies.forEach((f: any) => {
      const husband = f.husband_name?.trim() || null
      const wife = f.wife_name?.trim() || null
      const members = f.family_members || []

      const head = husband || wife || members[0]?.fullname || null
      if (!head || head.trim().toUpperCase() === 'UNKNOWN') return

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

  // AutoTable with footer (same as before)
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
    margin: { top: 14, bottom: 30 },
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
      cellPadding: 2,
      fillColor: false
    },
    columnStyles: { 2: { cellWidth: 70 }, 3: { cellWidth: 50 } },
    didParseCell: function (data) {
      const row = tableRows[data.row.index]
      if (!row.isSP && data.column.index === 2) data.cell.styles.fontSize = 7
    },
    headStyles: {
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      fillColor: false,
      cellPadding: 1,
      fontStyle: 'bold'
    },
    didDrawPage: function () {
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 14
      const footerY = pageHeight - 14

      doc.setFontSize(9)
      doc.text('Certified True and Correct:', margin, footerY - 11)
      doc.text('PGMO PH FOCAL PERSON', margin + 10, footerY)
      doc.line(margin, footerY - 3, 80, footerY - 3)

      const pageWidth = doc.internal.pageSize.getWidth()
      const rightX = pageWidth - 80
      doc.text('BARANGAY CAPTAIN', rightX + 10, footerY)
      doc.line(rightX, footerY - 3, pageWidth - margin, footerY - 3)
    }
  })

  doc.save(`${locationName}_FamilyComposition.pdf`)
}
