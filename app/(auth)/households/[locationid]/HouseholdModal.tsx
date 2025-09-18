'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppSelector } from '@/lib/redux/hook'
import { Household } from '@/types'
import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (household: Partial<Household>) => void
  onDelete?: (householdId: number) => void // 🔥 Add delete handler
  initialData?: Household | null
}

export default function HouseholdModal({
  open,
  onClose,
  onSave,
  onDelete,
  initialData
}: Props) {
  const location = useAppSelector((state) => state.location.selectedLocation)

  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [purok, setPurok] = useState('')
  const [sitio, setSitio] = useState('')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  // Sync modal state with initialData whenever it changes
  useEffect(() => {
    if (initialData) {
      setName(initialData.name ?? '')
      setPurok(initialData.purok ?? '')
      setSitio(initialData.sitio ?? '')
    } else {
      setName('')
      setPurok('')
      setSitio('')
    }
    setSaving(false)
  }, [initialData, open])

  const handleSubmit = () => {
    setSaving(true)
    onSave({
      id: initialData?.id,
      name,
      purok,
      sitio,
      barangay: location?.name,
      location_id: location?.id
    })
  }

  const handleDelete = () => {
    if (initialData?.id && onDelete) {
      onDelete(initialData.id)
      setShowConfirmDelete(false)
      onClose()
    }
  }

  return (
    <>
      {/* Main Modal */}
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {initialData ? 'Edit Household' : 'Add Household'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Household Name */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Household Name</label>
              <Input
                placeholder="Ex. Dela Cruz Household"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Purok */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Purok</label>
              <Input
                placeholder="Ex. 3"
                value={purok}
                onChange={(e) => setPurok(e.target.value)}
              />
            </div>
            {/* Sitio */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Sitio (optional)</label>
              <Input
                placeholder="Sitio"
                value={sitio}
                onChange={(e) => setSitio(e.target.value)}
              />
            </div>

            <div className="flex justify-between gap-2">
              {/* Show Delete only in edit mode */}
              {initialData && onDelete && (
                <Button
                  variant="ghost"
                  onClick={() => setShowConfirmDelete(true)}
                >
                  Delete This Household
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" disabled={saving} onClick={onClose}>
                  Cancel
                </Button>
                <Button disabled={saving} onClick={handleSubmit}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Modal */}
      <Dialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this household?</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
