/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { VoterOption } from './useBarangayVoters'

/**
 * Name search used for husband, wife and members.
 *
 * Searches the barangay's voters first (instant); when nothing matches and
 * at least two words were typed, asks the server for similar names in other
 * barangays. The typed name can always be added as not registered.
 * Arrow keys + Enter pick a result; Esc clears.
 */
export default function PersonPicker({
  voters,
  placeholder = 'Search: Lastname, Firstname Middlename',
  autoFocus,
  onPick
}: {
  voters: VoterOption[]
  placeholder?: string
  autoFocus?: boolean
  onPick: (person: VoterOption) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced] = useDebounce(query, 300)
  const [options, setOptions] = useState<VoterOption[]>([])
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const text = debounced.trim()
      if (!text) {
        setOptions([])
        return
      }
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)

      // 1. Local search in this barangay.
      const local = voters
        .filter((v) => {
          const name = (v.fullname || '').toLowerCase()
          return words.every((w) => name.includes(w))
        })
        .slice(0, 30)
      if (local.length > 0 || words.length < 2) {
        setOptions(local)
        setActive(0)
        return
      }

      // 2. Similar names elsewhere.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setSearching(true)
      const { data, error } = await supabase.rpc(
        'search_voters_similar',
        { query: text, limit_count: 2 },
        { signal: controller.signal } as any
      )
      if (cancelled) return
      setSearching(false)
      setOptions(
        !error && data?.length
          ? data.map((d: any) => ({ ...d, from_rpc: true }))
          : []
      )
      setActive(0)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [debounced, voters])

  const pickVoter = (v: VoterOption) => {
    onPick({ ...v, voter_id: v.id, is_registered: true })
    reset()
  }
  const pickNonRegistered = () => {
    const name = query.trim()
    if (!name) return
    onPick({ fullname: name, is_registered: false })
    reset()
  }
  const reset = () => {
    setQuery('')
    setOptions([])
    setActive(0)
    inputRef.current?.focus()
  }

  // Results plus the "add as not registered" row, for keyboard navigation.
  const rowCount = options.length + (query.trim() ? 1 : 0)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (searching || query !== debounced) return
      if (active < options.length) pickVoter(options[active])
      else pickNonRegistered()
    } else if (e.key === 'Escape') {
      setQuery('')
      setOptions([])
    }
  }

  const stillTyping = query.trim() !== '' && query !== debounced

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full border border-yellow-300 bg-white px-2 py-1 text-sm rounded focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      {query.trim() && !stillTyping && (
        <ul className="absolute z-20 left-0 right-0 mt-1 border rounded bg-white shadow-lg max-h-60 overflow-y-auto text-sm">
          {searching && (
            <li className="px-2 py-1 text-xs text-gray-500">
              Searching other barangays…
            </li>
          )}
          {options.map((v, i) => (
            <li
              key={`${v.id}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pickVoter(v)
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-2 py-1 cursor-pointer ${
                i === active ? 'bg-yellow-100' : ''
              }`}
            >
              <span className="font-medium">{v.fullname}</span>
              {v.from_rpc && v.barangay && (
                <span className="text-xs text-gray-500 ml-1">
                  · {v.barangay}
                  {v.address ? `, ${v.address}` : ''}
                </span>
              )}
            </li>
          ))}
          {!searching && options.length === 0 && (
            <li className="px-2 py-1 text-xs text-gray-500">
              No registered voter found. Check the spelling first.
            </li>
          )}
          {!searching && (
            <li
              onMouseDown={(e) => {
                e.preventDefault()
                pickNonRegistered()
              }}
              onMouseEnter={() => setActive(options.length)}
              className={`px-2 py-1 cursor-pointer border-t text-blue-700 ${
                active === options.length ? 'bg-yellow-100' : ''
              }`}
            >
              + Add “{query.trim()}” as not registered
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
