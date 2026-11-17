import * as XLSX from 'xlsx'

/** One row of asenso.ap_family_summary (a barangay). */
export interface ApSummaryRow {
  municipality: string
  barangay: string
  households: number
  families: number
  families_with_ap: number
  families_without_ap: number
  families_pending_review: number
  households_with_ap: number
  ap_people: number
  ap_non_registered: number
  new_identified_registered: number
  possible_duplicates: number
}

export type CountKey = Exclude<keyof ApSummaryRow, 'municipality' | 'barangay'>

/** Report columns, in order. `pct` is computed (families with AP / families). */
export const REPORT_COLUMNS: { key: CountKey | 'pct'; label: string }[] = [
  { key: 'households', label: 'Households' },
  { key: 'families', label: 'Families' },
  { key: 'families_with_ap', label: 'Families with ≥1 AP member' },
  { key: 'families_without_ap', label: 'Families without AP member' },
  { key: 'families_pending_review', label: 'Families pending review' },
  { key: 'pct', label: '% families with AP' },
  { key: 'households_with_ap', label: 'Households with AP' },
  { key: 'ap_people', label: 'AP persons' },
  { key: 'ap_non_registered', label: 'AP non-registered' },
  { key: 'new_identified_registered', label: 'New identified registered' },
  { key: 'possible_duplicates', label: 'Possible duplicates' }
]

export const COUNT_KEYS = REPORT_COLUMNS.filter((c) => c.key !== 'pct').map(
  (c) => c.key as CountKey
)

export const REPORT_NOTE =
  'Families with AP = husband, wife or any member is AP. Pending = not yet AP and at ' +
  'least one name awaits manual review. Ozamiz uses voters.is_ap; other towns use the ' +
  'AP members list. Households with no families are not counted.'

export function normalizeRows(raw: Record<string, unknown>[]): ApSummaryRow[] {
  return raw.map((r) => {
    const row = {
      municipality: String(r.municipality ?? '') || '(blank)',
      barangay: String(r.barangay ?? '') || '(blank)'
    } as ApSummaryRow
    for (const k of COUNT_KEYS) row[k] = Number(r[k] ?? 0)
    return row
  })
}

export function sumRows(rows: ApSummaryRow[]): Record<CountKey, number> {
  const total = {} as Record<CountKey, number>
  for (const k of COUNT_KEYS) total[k] = rows.reduce((s, r) => s + r[k], 0)
  return total
}

/** Rows rolled up to one per municipality, sorted by name. */
export function byMunicipality(rows: ApSummaryRow[]) {
  const groups = new Map<string, ApSummaryRow[]>()
  for (const r of rows) {
    const list = groups.get(r.municipality) ?? []
    list.push(r)
    groups.set(r.municipality, list)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([municipality, list]) => ({
      municipality,
      barangays: list.sort((a, b) => a.barangay.localeCompare(b.barangay)),
      totals: sumRows(list)
    }))
}

export const pct = (withAp: number, families: number) =>
  families === 0 ? 0 : withAp / families

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())

/** Excel sheet name: no "CITY OF"/"CITY", max 31 chars, unique. */
function sheetName(municipality: string, used: Set<string>) {
  let name = titleCase(
    municipality.replace(/^CITY OF /, '').replace(/ CITY$/, '')
  )
    .replace(/[\\/?*[\]:]/g, ' ')
    .slice(0, 31)
  while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`
  used.add(name)
  return name
}

/**
 * One sheet: title, note, header row, a row per item, and a TOTAL row.
 * Totals are SUM formulas and the % column is a formula; both also carry
 * their computed value so the file reads correctly before Excel recalculates.
 */
function buildSheet(
  title: string,
  firstLabel: string,
  items: { label: string; values: Record<CountKey, number> }[],
  generated: string
) {
  const header = [firstLabel, ...REPORT_COLUMNS.map((c) => c.label)]
  const aoa: (string | number)[][] = [
    [title],
    [`${REPORT_NOTE} Generated ${generated}.`],
    [],
    header
  ]
  for (const it of items) {
    aoa.push([
      it.label,
      ...REPORT_COLUMNS.map((c) =>
        c.key === 'pct'
          ? pct(it.values.families_with_ap, it.values.families)
          : it.values[c.key]
      )
    ])
  }
  const totals = {} as Record<CountKey, number>
  for (const k of COUNT_KEYS) totals[k] = items.reduce((s, it) => s + it.values[k], 0)
  aoa.push([
    'TOTAL',
    ...REPORT_COLUMNS.map((c) =>
      c.key === 'pct' ? pct(totals.families_with_ap, totals.families) : totals[c.key]
    )
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const headerRow = 4 // 1-based row of the header
  const firstData = headerRow + 1
  const lastData = headerRow + items.length
  const totalRow = lastData + 1

  REPORT_COLUMNS.forEach((c, i) => {
    const col = XLSX.utils.encode_col(i + 1)
    for (let r = firstData; r <= totalRow; r++) {
      const cell = ws[`${col}${r}`]
      if (!cell) continue
      if (c.key === 'pct') {
        // % with AP = families with AP (col D) / families (col C)
        cell.f = `IF(C${r}=0,0,D${r}/C${r})`
        cell.z = '0.0%'
      } else {
        cell.z = '#,##0'
        if (r === totalRow && items.length > 0) {
          cell.f = `SUM(${col}${firstData}:${col}${lastData})`
        }
      }
    }
  })

  ws['!cols'] = [{ wch: 34 }, ...REPORT_COLUMNS.map(() => ({ wch: 14 }))]
  ws['!autofilter'] = {
    ref: `A${headerRow}:${XLSX.utils.encode_col(REPORT_COLUMNS.length)}${lastData}`
  }
  return ws
}

/** Overview sheet by municipality + one sheet per municipality by barangay. */
export function downloadApSummaryExcel(rows: ApSummaryRow[], generatedAt: Date) {
  const generated = generatedAt.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
  const groups = byMunicipality(rows)
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      'AP Family Summary by Municipality',
      'Municipality',
      groups.map((g) => ({ label: titleCase(g.municipality), values: g.totals })),
      generated
    ),
    'Overview'
  )

  const used = new Set<string>(['Overview'])
  for (const g of groups) {
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(
        `${titleCase(g.municipality)} — AP Family Summary by Barangay`,
        'Barangay',
        g.barangays.map((b) => ({ label: b.barangay, values: b })),
        generated
      ),
      sheetName(g.municipality, used)
    )
  }

  const stamp = generatedAt.toISOString().slice(0, 10)
  XLSX.writeFile(wb, `ap-family-summary-${stamp}.xlsx`)
}
