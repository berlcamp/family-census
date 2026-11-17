'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { fmt } from './useDashboardData'

export interface Column<T> {
  key: keyof T & string
  label: string
  /** Numeric columns are right-aligned, summed in the total row and sortable. */
  numeric?: boolean
}

/**
 * Compact, sortable table with a sticky header and a TOTAL row.
 * Click a header to sort; click again to reverse.
 */
export default function StatsTable<T extends Record<string, string | number>>({
  title,
  rows,
  columns,
  loading,
  error,
  maxHeight = 'max-h-[560px]'
}: {
  title: string
  rows: T[]
  columns: Column<T>[]
  loading: boolean
  error?: string | null
  maxHeight?: string
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0].key)
  const [desc, setDesc] = useState(false)

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const x = a[sortKey]
      const y = b[sortKey]
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y))
      return desc ? -c : c
    })
    return copy
  }, [rows, sortKey, desc])

  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of columns) {
      if (c.numeric) t[c.key] = rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0)
    }
    return t
  }, [rows, columns])

  const onSort = (key: string, numeric?: boolean) => {
    if (key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(key)
      setDesc(!!numeric) // numbers: largest first
    }
  }

  return (
    <section className="rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <h2 className="border-b px-4 py-3 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100">
        {title}
      </h2>
      {error ? (
        <p className="p-4 text-sm text-red-600">{error}</p>
      ) : (
        <div className={`overflow-auto ${maxHeight}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-medium ${
                      c.numeric ? 'text-right' : 'text-left'
                    }`}
                    onClick={() => onSort(c.key, c.numeric)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sortKey === c.key &&
                        (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i} className="border-t dark:border-gray-800">
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2">
                          <div
                            className={`h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${
                              c.numeric ? 'ml-auto w-10' : 'w-28'
                            }`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : sorted.map((r, i) => (
                    <tr
                      key={i}
                      className="border-t hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                    >
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={`px-3 py-1.5 ${
                            c.numeric
                              ? 'text-right tabular-nums'
                              : 'text-gray-800 dark:text-gray-100'
                          }`}
                        >
                          {c.numeric ? fmt(Number(r[c.key] ?? 0)) : r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-gray-100 font-semibold dark:bg-gray-800">
                <tr className="border-t-2 dark:border-gray-700">
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-3 py-2 ${c.numeric ? 'text-right tabular-nums' : ''}`}
                    >
                      {i === 0 ? 'TOTAL' : c.numeric ? fmt(totals[c.key]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}
