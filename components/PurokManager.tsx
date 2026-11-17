'use client'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useAppDispatch } from '@/lib/redux/hook'
import { setLocation } from '@/lib/redux/locationSlice'
import { updateList } from '@/lib/redux/locationsSlice'
import { supabase } from '@/lib/supabase/client'
import { Location } from '@/types'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type Pending =
  | { kind: 'delete'; name: string; count: number }
  | { kind: 'rename'; from: string; to: string; count: number }
  | null

/**
 * A barangay's purok list (locations.purok) with add / rename / delete.
 * Each change is saved right away. Renaming moves that purok's households to
 * the new name; deleting sets their purok to blank (after a confirmation that
 * says how many households are affected).
 */
export default function PurokManager({
  location,
  canEdit
}: {
  location: Location
  canEdit: boolean
}) {
  const dispatch = useAppDispatch()
  const puroks: string[] = Array.isArray(location.purok) ? location.purok : []

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [countsLoading, setCountsLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  // Households per purok in this barangay.
  const loadCounts = useCallback(async () => {
    setCountsLoading(true)
    const tally: Record<string, number> = {}
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('households')
        .select('purok')
        .eq('location_id', location.id)
        .order('id')
        .range(from, from + 999)
      if (error) {
        console.error(error)
        break
      }
      for (const h of data ?? []) tally[h.purok ?? ''] = (tally[h.purok ?? ''] ?? 0) + 1
      if (!data || data.length < 1000) break
    }
    setCounts(tally)
    setCountsLoading(false)
  }, [location.id])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  const exists = (name: string, except?: string) =>
    puroks.some(
      (p) => p.toLowerCase() === name.toLowerCase() && p !== except
    )

  /** Save a new purok list, starting from the latest one in the database. */
  const saveList = async (change: (current: string[]) => string[]) => {
    const { data: fresh, error: readError } = await supabase
      .from('locations')
      .select('purok')
      .eq('id', location.id)
      .single()
    if (readError) throw readError
    const current: string[] = Array.isArray(fresh?.purok) ? fresh.purok : []
    const { data, error } = await supabase
      .from('locations')
      .update({ purok: change(current) })
      .eq('id', location.id)
      .select()
      .single()
    if (error) throw error
    dispatch(updateList(data))
    dispatch(setLocation(data))
  }

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    if (exists(name)) {
      toast.error(`Purok "${name}" already exists.`)
      return
    }
    setBusy(true)
    try {
      await saveList((current) => [...current, name])
      setNewName('')
      toast.success(`Added ${name}`)
    } catch (e) {
      toast.error(`Could not add purok: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const startRename = () => {
    if (!editing) return
    const to = editing.to.trim()
    if (!to || to === editing.from) {
      setEditing(null)
      return
    }
    if (exists(to, editing.from)) {
      toast.error(`Purok "${to}" already exists.`)
      return
    }
    const count = counts[editing.from] ?? 0
    if (count > 0) setPending({ kind: 'rename', from: editing.from, to, count })
    else void rename(editing.from, to)
  }

  const rename = async (from: string, to: string) => {
    setBusy(true)
    try {
      // Households first: if the list update then fails, the old name is
      // still listed (with no households) and the rename can be retried.
      const { error } = await supabase
        .from('households')
        .update({ purok: to })
        .eq('location_id', location.id)
        .eq('purok', from)
      if (error) throw error
      await saveList((current) => current.map((p) => (p === from ? to : p)))
      toast.success(`Renamed ${from} to ${to}`)
      setEditing(null)
      await loadCounts()
    } catch (e) {
      toast.error(`Could not rename purok: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const remove = async (name: string) => {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('households')
        .update({ purok: '' })
        .eq('location_id', location.id)
        .eq('purok', name)
      if (error) throw error
      await saveList((current) => current.filter((p) => p !== name))
      toast.success(`Deleted ${name}`)
      await loadCounts()
    } catch (e) {
      toast.error(`Could not delete purok: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  const countLabel = (name: string) => {
    if (countsLoading) return '…'
    const n = counts[name] ?? 0
    return `${n.toLocaleString()} household${n === 1 ? '' : 's'}`
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-medium">Puroks</div>
        {!canEdit && (
          <span className="text-xs text-gray-400">Editing is turned off</span>
        )}
      </div>

      {puroks.length === 0 && (
        <p className="text-sm text-gray-500">No puroks yet.</p>
      )}

      <ul className="divide-y rounded-md border text-sm dark:divide-gray-800 dark:border-gray-700">
        {puroks.map((p) =>
          editing?.from === p ? (
            <li key={p} className="flex items-center gap-2 px-2 py-1.5">
              <input
                autoFocus
                value={editing.to}
                onChange={(e) => setEditing({ from: p, to: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') startRename()
                  if (e.key === 'Escape') setEditing(null)
                }}
                className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
              />
              <IconButton label="Save" onClick={startRename} disabled={busy}>
                <Check className="h-4 w-4 text-green-600" />
              </IconButton>
              <IconButton label="Cancel" onClick={() => setEditing(null)} disabled={busy}>
                <X className="h-4 w-4 text-gray-500" />
              </IconButton>
            </li>
          ) : (
            <li key={p} className="group flex items-center gap-2 px-3 py-1.5">
              <span className="flex-1 font-medium text-gray-800 dark:text-gray-100">{p}</span>
              <span className="text-xs tabular-nums text-gray-400">{countLabel(p)}</span>
              {canEdit && (
                <>
                  <IconButton
                    label={`Rename ${p}`}
                    disabled={busy}
                    onClick={() => setEditing({ from: p, to: p })}
                  >
                    <Pencil className="h-3.5 w-3.5 text-blue-700" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${p}`}
                    disabled={busy || countsLoading}
                    onClick={() =>
                      setPending({ kind: 'delete', name: p, count: counts[p] ?? 0 })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </IconButton>
                </>
              )}
            </li>
          )
        )}
      </ul>

      {canEdit && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New purok name"
            className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
          />
          <Button type="submit" size="sm" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null)
        }}
        destructive={pending?.kind === 'delete'}
        loading={busy}
        confirmText={pending?.kind === 'delete' ? 'Delete' : 'Rename'}
        title={
          pending?.kind === 'delete'
            ? `Delete ${pending.name}?`
            : pending
              ? `Rename ${pending.from} to ${pending.to}?`
              : ''
        }
        description={
          pending?.kind === 'delete'
            ? pending.count > 0
              ? `${pending.count.toLocaleString()} household${pending.count === 1 ? '' : 's'} in ${pending.name} will have ${pending.count === 1 ? 'its' : 'their'} purok changed to blank.`
              : `No households are in ${pending.name}.`
            : pending
              ? `${pending.count.toLocaleString()} household${pending.count === 1 ? '' : 's'} in ${pending.from} will be moved to ${pending.to}.`
              : undefined
        }
        onConfirm={async () => {
          if (!pending) return
          if (pending.kind === 'delete') await remove(pending.name)
          else await rename(pending.from, pending.to)
          setPending(null)
        }}
      />
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
    >
      {children}
    </button>
  )
}
