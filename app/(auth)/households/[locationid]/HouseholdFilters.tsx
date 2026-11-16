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
