/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySPCongByHHNoNR = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch households with SP info
  const { data, error } = await supabase
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

  if (error || !data) {
    console.error(error)
    return
  }

  // ensure correct typing locally
  const households: any[] = Array.isArray(data) ? data : []

  const doc = new jsPDF({
    unit: 'mm',
    format: 'letter',
    orientation: 'portrait'
  })
  doc.setFontSize(10)

  // Group households by SP name
  const spGroups: Record<string, any[]> = {}
  households.forEach((h: any) => {
    const spName =
      String(h.service_providers?.name ?? 'UNASSIGNED').trim() || 'UNASSIGNED'
    if (!spGroups[spName]) spGroups[spName] = []
    spGroups[spName].push(h)
  })

  const spNames = Object.keys(spGroups).sort((a, b) => a.localeCompare(b))
  const tableRows: any[] = []
  const iterator = 1

  spNames.forEach((spName) => {
    const spHouseholds = spGroups[spName]

    spHouseholds.forEach((h: any) => {
      const families: any[] = Array.isArray(h.families) ? h.families : []

      const validFamilies: any[] = []

      // 1. Filter families based on your original validity rules
      families.forEach((f: any) => {
        const hasAsensoHusband = !!f.asenso_husband
        const hasAsensoWife = !!f.asenso_wife
        const hasAsensoMember = !!f.family_members?.[0]?.asenso
        const allNr = f.all_nr === true

        // EXCLUDE if all_nr = true
        if (allNr) return

        const isValidFamily =
          hasAsensoHusband || hasAsensoWife || hasAsensoMember || allNr

        if (!isValidFamily) return

        const husband = String(f.husband_name ?? '').trim()
        const wife = String(f.wife_name ?? '').trim()
        const headCandidate =
          husband ||
          wife ||
          String(f.family_members?.[0]?.fullname ?? '').trim() ||
          null

        if (!headCandidate) return
        if (headCandidate.toUpperCase() === 'UNKNOWN') return

        validFamilies.push(f)
      })

      // If household has no valid families → skip the entire household
      if (validFamilies.length === 0) return

      // 2. Prepare combined household data
      const householdMembers: string[] = []
      let head: string | null = null

      validFamilies.forEach((f: any) => {
        const husband = String(f.husband_name ?? '').trim()
        const wife = String(f.wife_name ?? '').trim()
        const members: any[] = Array.isArray(f.family_members)
          ? f.family_members
          : []

        if (husband) householdMembers.push(husband.toUpperCase())
        if (wife) householdMembers.push(wife.toUpperCase())
        members.forEach((m: any) => {
          const fullname = String(m?.fullname ?? '').trim()
          if (fullname) householdMembers.push(fullname.toUpperCase())
        })

        // Determine household head (first valid husband > wife > member)
        if (!head) {
          if (husband) head = husband
          else if (wife) head = wife
          else if (members.length) {
            const candidate = String(members[0]?.fullname ?? '').trim()
            head = candidate || null
          }
        }
      })

      if (!head || typeof head !== 'string') return
      const headStr = String(head)

      if (headStr.trim().toUpperCase() === 'UNKNOWN') return

      // Create table row but sort later
      tableRows.push({
        iterator, // will be reassigned after sorting
        name: headStr.toUpperCase(),
        members: householdMembers.join('\n'),
        signature: '',
        ap: iterator,
        isSP: !!(spName && spName !== 'UNASSIGNED')
      })
    })
  })

  // 3. Sort final results by household head name
  tableRows.sort((a, b) => a.name.localeCompare(b.name))

  // 4. Reassign iterator after sorting
  tableRows.forEach((row, idx) => {
    row.iterator = idx + 1
    row.ap = idx + 1
  })

  // AutoTable with footer (same as before)
  autoTable(doc, {
    startY: 14,
    head: [
      [
        {
          content: ' ', // placeholder, we will override in didDrawCell
          colSpan: 5,
          styles: { halign: 'center', cellPadding: 0, lineWidth: 0 }
        }
      ],
      [
        {
          content: 'LIST OF BENEFICIARIES',
          colSpan: 5,
          styles: {
            halign: 'center',
            lineWidth: 0,
            fontStyle: 'bold',
            fontSize: 10,
            cellPadding: { top: 5, bottom: 2, left: 0, right: 0 } // ↑ bigger top padding
          }
        }
      ],
      [
        {
          content: `BARANGAY ${locationName} HOUSEHOLDS`,
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
          content:
            'This is to acknowledge the receipt of the Pamaskong Handog 2025 food packs.',
          colSpan: 5,
          styles: {
            halign: 'left',
            lineWidth: 0,
            fontSize: 9,
            fontStyle: 'italic',
            cellPadding: { top: 5, bottom: 2, left: 0, right: 0 } // ↑ bigger top padding
          }
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
      // const pageHeight = doc.internal.pageSize.getHeight()
      // const margin = 14
      // const footerY = pageHeight - 14
      // doc.setFontSize(9)
      // doc.text('Certified True and Correct:', margin, footerY - 11)
      // doc.text('PGMO PH FOCAL PERSON', margin + 10, footerY)
      // doc.line(margin, footerY - 3, 80, footerY - 3)
      // const pageWidth = doc.internal.pageSize.getWidth()
      // const rightX = pageWidth - 80
      // doc.text('BARANGAY CAPTAIN', rightX + 10, footerY)
      // doc.line(rightX, footerY - 3, pageWidth - margin, footerY - 3)
    },
    didDrawCell: function (data) {
      if (data.row.index === 0 && data.section === 'head') {
        const cell = data.cell
        const centerX = cell.x + cell.width / 2
        const centerY = cell.y + cell.height / 2 + 3

        // Part 1: "Pamas"
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        const text1 = 'Pamas'
        const w1 = doc.getTextWidth(text1)

        // Part 2a: "CONG "
        doc.setFontSize(14)
        const text2a = 'CONG '
        const w2a = doc.getTextWidth(text2a)

        // Part 2b: "H"
        doc.setFontSize(10)
        const text2b = 'H'
        const w2b = doc.getTextWidth(text2b)

        // Part 2c: "ANDO"
        doc.setFontSize(14)
        const text2c = 'ANDO'
        const w2c = doc.getTextWidth(text2c)

        // Part 3: "2024"
        doc.setFontSize(10)
        const text3 = 'g 2025'
        const w3 = doc.getTextWidth(text3)

        // Total width for centering
        const totalWidth = w1 + w2a + w2b + w2c + w3
        let x = centerX - totalWidth / 2

        // Draw "Pamas"
        doc.setFontSize(10)
        doc.text(text1, x, centerY)
        x += w1

        // Draw "CONG "
        doc.setFontSize(14)
        doc.text(text2a, x, centerY)
        x += w2a

        // Draw "H"
        doc.setFontSize(10)
        doc.text(text2b, x, centerY)
        x += w2b

        // Draw "ANDO"
        doc.setFontSize(14)
        doc.text(text2c, x, centerY)
        x += w2c

        // Draw "2024"
        doc.setFontSize(10)
        doc.text(text3, x, centerY)
      }
    }
  })

  doc.save(`${locationName}_FamilyComposition.pdf`)
}
