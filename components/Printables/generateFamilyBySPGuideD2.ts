/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase/client'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const generateFamilyBySPGuideD2 = async (
  locationName: string,
  locationAddress: string
) => {
  if (!locationName) return

  // Fetch all households
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

  // Separate households with SP and without SP
  const assignedHouseholds = households.filter((h) => h.sp_id)
  const unassignedHouseholds = households.filter((h) => !h.sp_id)

  // Group assigned households by SP name
  const spGroups: Record<string, any[]> = {}
  assignedHouseholds.forEach((h: any) => {
    const spName = h.service_providers?.name?.trim() || 'UNKNOWN'
    if (!spGroups[spName]) spGroups[spName] = []
    spGroups[spName].push(h)
  })

  const spNames = Object.keys(spGroups).sort((a, b) => a.localeCompare(b))
  const tableRows: any[] = []
  let iterator = 1

  // Function to process households and add to tableRows
  const processHouseholds = (householdList: any[], spLabel?: string) => {
    if (householdList.length === 0) return
    if (spLabel) {
      // SP header row (bold, no number)
      tableRows.push({
        iterator: '',
        name: spLabel.toUpperCase(),
        members: '',
        signature: '',
        ap: iterator,
        isSP: true
      })
    }

    const sortedFamilies: any[] = []
    householdList.forEach((h) => {
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
        if (!head || head.trim().toUpperCase() === 'UNKNOWN') return
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
  }

  // Process households with SP first
  spNames.forEach((spName) => processHouseholds(spGroups[spName], spName))

  // Process UNASSIGNED households at the bottom
  processHouseholds(unassignedHouseholds, 'UNASSIGNED')

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
