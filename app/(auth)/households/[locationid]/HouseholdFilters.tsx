'use client'

import { X } from 'lucide-react'

export function FilterSelect({
  icon,
  value,
  onChange,
  options
}: {
  icon: React.ReactNode
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div
      className={`relative flex h-9 items-center rounded-md border pl-2 text-sm ${
        value ? 'border-blue-400 bg-blue-50 text-blue-800' : 'bg-white text-gray-700'
      }`}
    >
      <span className="text-gray-400">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full max-w-[180px] cursor-pointer appearance-none bg-transparent pl-1.5 pr-6 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-[10px] text-gray-400">▼</span>
    </div>
  )
}

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">
      {label}
      <button
        type="button"
        aria-label={`Clear ${label}`}
        onClick={onClear}
        className="rounded-full hover:bg-blue-200"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

/** Neutral placeholder shaped like a household card, shown while loading. */
export function HouseholdCardSkeleton() {
  const bar = 'rounded bg-gray-200 dark:bg-gray-700'
  return (
    <div
      aria-hidden
      className="animate-pulse rounded-sm border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="flex justify-between">
        <div className={`h-5 w-2/3 ${bar}`} />
        <div className={`h-3 w-16 ${bar}`} />
      </div>
      <div className={`mt-3 h-3 w-1/3 ${bar}`} />
      <div className={`mt-2 h-3 w-1/4 ${bar}`} />
      <div className={`mt-2 h-3 w-2/5 ${bar}`} />
      <div className="mt-5 space-y-2 rounded bg-gray-50 p-2 dark:bg-gray-800">
        <div className={`h-4 w-3/4 ${bar}`} />
        <div className={`h-4 w-2/3 ${bar}`} />
        <div className={`ml-4 h-3 w-1/2 ${bar}`} />
        <div className={`ml-4 h-3 w-3/5 ${bar}`} />
      </div>
      <div className={`mt-4 h-6 w-24 ${bar}`} />
    </div>
  )
}
