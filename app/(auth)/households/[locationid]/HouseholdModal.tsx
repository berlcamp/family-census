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
import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onSave: (household: Partial<Household>) => void
  initialData?: Household | null
}

export default function HouseholdModal({
  open,
  onClose,
  onSave,
  initialData
}: Props) {
  const [name, setName] = useState(initialData?.name ?? '')

  const location = useAppSelector((state) => state.location.selectedLocation)

  const handleSubmit = () => {
    onSave({ id: initialData?.id, name, barangay: location?.name })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Edit Household' : 'Add Household'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Household Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
