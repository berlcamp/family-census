'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase/client'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface TrashItem {
  id: number
  household_id: number
  name: string | null
  purok: string | null
  family_count: number
  member_count: number
  deleted_by: string | null
  deleted_at: string
  data: {
    families?: { husband_name: string | null; wife_name: string | null }[]
  }
}

/**
 * Trash button + list of this barangay's deleted households
 * (asenso.household_trash). Restoring puts the household back with its
 * families, members and Kadiwa claims (asenso.restore_household).
 * `version` changes whenever a household is moved to the trash.
 */
export default function HouseholdTrash({
  locationId,
  version,
  onRestored
}: {
  locationId: number
  version: number
  onRestored: (householdName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TrashItem[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<number | null>(null)

  const loadCount = useCallback(async () => {
    const { count: n, error } = await supabase
      .from('household_trash')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', locationId)
    if (!error) setCount(n ?? 0)
  }, [locationId])

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('household_trash')
      .select(
        'id, household_id, name, purok, family_count, member_count, deleted_by, deleted_at, data->families'
      )
      .eq('location_id', locationId)
      .order('deleted_at', { ascending: false })
      .limit(200)
    setLoading(false)
    if (error) {
      toast.error(`Could not load the trash: ${error.message}`)
      return
    }
    setItems(
      (data ?? []).map((d) => ({
        ...(d as unknown as TrashItem),
        data: { families: (d as unknown as { families: TrashItem['data']['families'] }).families }
      }))
    )
    setCount(data?.length ?? 0)
  }, [locationId])

  useEffect(() => {
    loadCount()
  }, [loadCount, version])

  useEffect(() => {
    if (open) loadItems()
  }, [open, loadItems])

  const restore = async (item: TrashItem) => {
    setRestoringId(item.id)
    const { error } = await supabase.rpc('restore_household', {
      p_trash_id: item.id
    })
    setRestoringId(null)
    if (error) {
      toast.error(`Could not restore: ${error.message}`)
      return
    }
    toast.success(`Restored ${item.name ?? 'household'}`)
    setItems((prev) => prev.filter((x) => x.id !== item.id))
    setCount((n) => Math.max(0, n - 1))
    onRestored(item.name ?? '')
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="relative">
        <Trash2 className="h-4 w-4" /> Trash
        {count > 0 && (
          <span className="ml-1 rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            {count}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deleted households</DialogTitle>
            <DialogDescription>
              Restoring brings the household back with its families and members.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">The trash is empty.</p>
            ) : (
              <ul className="divide-y text-sm dark:divide-gray-800">
                {items.map((item) => {
                  const heads = (item.data.families ?? [])
                    .map((f) => [f.husband_name, f.wife_name].filter(Boolean).join(' & '))
                    .filter(Boolean)
                  return (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-50">
                          {item.name || '(no name)'}
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            {item.purok ? `Purok: ${item.purok} · ` : ''}
                            {item.family_count} famil{item.family_count === 1 ? 'y' : 'ies'},{' '}
                            {item.member_count} member{item.member_count === 1 ? '' : 's'}
                          </span>
                        </div>
                        {heads.length > 0 && (
                          <div className="truncate text-xs text-gray-600 dark:text-gray-300">
                            {heads.join(' · ')}
                          </div>
                        )}
                        <div className="text-xs text-gray-400">
                          Deleted{' '}
                          {new Date(item.deleted_at).toLocaleString('en-PH', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                          {item.deleted_by ? ` by ${item.deleted_by}` : ''}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoringId !== null}
                        onClick={() => restore(item)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        {restoringId === item.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
