'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/lib/redux/hook'
import { Household } from '@/types'
import { useEffect, useState } from 'react'

/**
 * Add / edit a household directly in its yellow card (no modal).
 * `onSave` returns true when saved. Sitio is not edited here (the field was
 * hidden) and is left untouched on save.
 */
export default function HouseholdEditor({
  initialData,
  onSave,
  onDelete,
  onCancel,
  onDirtyChange
}: {
  initialData: Household | null
  onSave: (household: Partial<Household>) => Promise<boolean>
  onDelete?: () => Promise<void>
  onCancel: () => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const location = useAppSelector((s) => s.location.selectedLocation)

  const initial = {
    name: initialData?.name ?? '',
    purok: initialData?.purok ?? '',
    sp:
      initialData?.sp_id !== null && initialData?.sp_id !== undefined
        ? String(initialData.sp_id)
        : ''
  }
  const [name, setName] = useState(initial.name)
  const [purok, setPurok] = useState(initial.purok)
  const [sp, setSp] = useState(initial.sp)
  const [errors, setErrors] = useState<{ name?: string; purok?: string }>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty =
    name !== initial.name || purok !== initial.purok || sp !== initial.sp
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const save = async () => {
    const newErrors: typeof errors = {}
    if (!name.trim()) newErrors.name = 'Household name is required.'
    if (!purok.trim()) newErrors.purok = 'Purok is required.'
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    setSaving(true)
    try {
      const ok = await onSave({
        id: initialData?.id,
        name: name.trim(),
        purok,
        sp
      })
      if (ok) onCancel()
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    'w-full rounded border border-yellow-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400'

  return (
    <div
      className="rounded border-2 border-yellow-400 bg-yellow-50 p-2 text-sm shadow-sm"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          save()
        }
        if (e.key === 'Escape' && !saving) onCancel()
      }}
    >
      <div className="mb-2 text-xs font-semibold uppercase text-yellow-800">
        {initialData ? 'Edit household' : 'New household'}
      </div>

      <label className="mb-0.5 block text-xs font-medium text-gray-600">
        Household description *
      </label>
      <Input
        autoFocus
        placeholder="Ex. Dela Cruz Household"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`h-8 border-yellow-300 bg-white ${errors.name ? 'border-red-500' : ''}`}
      />
      {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">
            Purok *
          </label>
          <select
            value={purok}
            onChange={(e) => setPurok(e.target.value)}
            className={`${fieldClass} ${errors.purok ? 'border-red-500' : ''}`}
          >
            <option value="">-- Select --</option>
            {Array.isArray(location?.purok) &&
              location.purok.map((p, i) => (
                <option key={i} value={p}>
                  {p}
                </option>
              ))}
          </select>
          {errors.purok && <p className="text-xs text-red-600">{errors.purok}</p>}
        </div>
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">
            Service provider
          </label>
          <select
            value={sp}
            onChange={(e) => setSp(e.target.value)}
            className={fieldClass}
          >
            <option value="">No SP</option>
            {location?.service_providers
              ?.slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {initialData && onDelete && !confirmDelete && (
          <Button
            size="xs"
            variant="ghost"
            className="text-red-600"
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
          >
            Delete household
          </Button>
        )}
        {confirmDelete && (
          <span className="flex flex-wrap items-center gap-1 text-xs text-red-700">
            Delete this household
            {initialData?.families?.length
              ? ` and its ${initialData.families.length} famil${initialData.families.length === 1 ? 'y' : 'ies'}`
              : ''}
            ?
            <Button
              size="xs"
              variant="destructive"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                await onDelete?.()
                setSaving(false)
              }}
            >
              Yes, delete
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="xs" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button size="xs" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
