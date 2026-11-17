'use client'

import { fmt } from './useDashboardData'

export interface Tile {
  label: string
  value: number
  hint?: string
}

/** Row of headline numbers. */
export default function StatTiles({
  tiles,
  loading
}: {
  tiles: Tile[]
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {t.label}
          </div>
          {loading ? (
            <div className="mt-2 h-7 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : (
            <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
              {fmt(t.value)}
            </div>
          )}
          {t.hint && (
            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {t.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
