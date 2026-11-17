'use client'

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { BarangayStat, fmt } from './useDashboardData'

// Series colours (validated categorical slots 1 and 2, light + dark).
// Defined as CSS variables on .dash-chart so dark mode swaps them in one place.
const SERIES = [
  { key: 'households', label: 'Households', color: 'var(--dash-series-1)' },
  { key: 'families', label: 'Families', color: 'var(--dash-series-2)' }
] as const

type SortKey = 'households' | 'name'

/**
 * Households and families per barangay: horizontal grouped bars (two series
 * on one shared axis), sorted largest first by default, with a hover tooltip.
 */
export default function BarangayChart({
  data,
  loading
}: {
  data: BarangayStat[]
  loading: boolean
}) {
  const [sort, setSort] = useState<SortKey>('households')

  const rows = useMemo(() => {
    const copy = [...data]
    if (sort === 'households') copy.sort((a, b) => b.households - a.households)
    else copy.sort((a, b) => a.barangay.localeCompare(b.barangay))
    return copy
  }, [data, sort])

  return (
    <section className="dash-chart rounded-lg border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <style>{`
        .dash-chart { --dash-series-1: #2a78d6; --dash-series-2: #eb6834;
          --dash-grid: #e7e5e4; --dash-axis: #52514e; }
        .dark .dash-chart { --dash-series-1: #3987e5; --dash-series-2: #d95926;
          --dash-grid: #3a3a38; --dash-axis: #c3c2b7; }
      `}</style>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Households and families per barangay
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
        <div className="ml-auto inline-flex rounded-md border text-xs dark:border-gray-700">
          {(
            [
              ['households', 'Largest first'],
              ['name', 'A–Z']
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 first:rounded-l-md last:rounded-r-md ${
                sort === key
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div
                className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
                style={{ width: `${70 - i * 5}%` }}
              />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">No data available</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 34 + 40)}>
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
            barCategoryGap={8}
            barGap={2}
          >
            <CartesianGrid horizontal={false} stroke="var(--dash-grid)" />
            <XAxis
              type="number"
              tickFormatter={fmt}
              tick={{ fontSize: 11, fill: 'var(--dash-axis)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="barangay"
              type="category"
              width={150}
              interval={0}
              tick={{ fontSize: 11, fill: 'var(--dash-axis)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(120,120,120,0.08)' }}
              content={<ChartTooltip />}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                barSize={11}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}

function ChartTooltip({
  active,
  payload
}: {
  active?: boolean
  payload?: { payload: BarangayStat }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const rows: [string, number, string?][] = [
    ['Households', d.households, 'var(--dash-series-1)'],
    ['Families', d.families, 'var(--dash-series-2)'],
    ['Registered members', d.total_registered],
    ['Families all not registered', d.total_non_registered]
  ]
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 font-semibold text-gray-900 dark:text-gray-50">{d.barangay}</div>
      {rows.map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            {color ? (
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
            ) : (
              <span className="inline-block h-2 w-2" />
            )}
            {label}
          </span>
          <span className="tabular-nums font-medium text-gray-900 dark:text-gray-50">
            {fmt(value)}
          </span>
        </div>
      ))}
    </div>
  )
}
