/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'

interface Voter {
  id?: number
  voter_id?: number
  fullname: string
  barangay?: string | null
  is_registered?: boolean
}

interface FamilyFormProps {
  open: boolean
  onSave: (family: any) => void
  onDelete?: (householdId: number, familyId: number) => void // 🔥 Add delete handler
  onCancel: () => void
  initialFamily?: any
}

export default function FamilyModal({
  open,
  onSave,
  onDelete,
  onCancel,
  initialFamily
}: FamilyFormProps) {
  const [husbandQuery, setHusbandQuery] = useState('')
  const [wifeQuery, setWifeQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [husbandOptions, setHusbandOptions] = useState<Voter[]>([])
  const [wifeOptions, setWifeOptions] = useState<Voter[]>([])
  const [memberOptions, setMemberOptions] = useState<Voter[]>([])
  const [selectedHusband, setSelectedHusband] = useState<Voter | null>(
    initialFamily?.husband ?? null
  )
  const [selectedWife, setSelectedWife] = useState<Voter | null>(
    initialFamily?.wife ?? null
  )
  const [members, setMembers] = useState<any[]>(
    initialFamily?.family_members ?? []
  )
  const [allVoters, setAllVoters] = useState<Voter[]>([])

  const [saving, setSaving] = useState(false)

  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const location = useAppSelector((state) => state.location.selectedLocation)

  // debounce queries
  const [debouncedHusbandQuery] = useDebounce(husbandQuery, 400)
  const [debouncedWifeQuery] = useDebounce(wifeQuery, 400)
  const [debouncedMemberQuery] = useDebounce(memberQuery, 400)

  // husband search
  useEffect(() => {
    if (!debouncedHusbandQuery.trim()) {
      setHusbandOptions([]) // empty, so no dropdown
      return
    }

    const searchWords = debouncedHusbandQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // 🔑 remove everything except letters, numbers, spaces
      .split(/\s+/)
      .filter(Boolean)

    const filtered = allVoters.filter((user) => {
      const fullName = `${user.fullname || ''}`.toLowerCase()
      return searchWords.every((word) => fullName.includes(word))
    })

    setHusbandOptions(filtered)
  }, [debouncedHusbandQuery, allVoters])

  // wife search
  useEffect(() => {
    if (!debouncedWifeQuery.trim()) {
      setWifeOptions([]) // empty, so no dropdown
      return
    }

    const searchWords = debouncedWifeQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // 🔑 remove everything except letters, numbers, spaces
      .split(/\s+/)
      .filter(Boolean)

    const filtered = allVoters.filter((user) => {
      const fullName = `${user.fullname || ''}`.toLowerCase()
      return searchWords.every((word) => fullName.includes(word))
    })

    setWifeOptions(filtered)
  }, [debouncedWifeQuery, allVoters])

  // member search
  useEffect(() => {
    if (!debouncedMemberQuery.trim()) {
      setMemberOptions([]) // empty, so no dropdown
      return
    }

    const searchWords = debouncedMemberQuery
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // 🔑 remove everything except letters, numbers, spaces
      .split(/\s+/)
      .filter(Boolean)

    const filtered = allVoters.filter((user) => {
      const fullName = `${user.fullname || ''}`.toLowerCase()
      return searchWords.every((word) => fullName.includes(word))
    })

    setMemberOptions(filtered)
  }, [debouncedMemberQuery, allVoters])

  const handleAddMember = (voter: Voter) => {
    if (members.some((m) => m.fullname === voter.fullname)) {
      alert(`${voter.fullname} is already added as a member.`)
      return
    }
    setMembers([
      ...members,
      {
        voter_id: voter.id || null,
        fullname:
          voter.is_registered === false ? `${voter.fullname}` : voter.fullname,
        relation: '',
        is_registered: voter.is_registered !== false
      }
    ])
    setMemberQuery('')
    setMemberOptions([])
  }

  const handleSubmit = () => {
    setSaving(true)
    onSave({
      id: initialFamily?.id,
      husband: selectedHusband,
      wife: selectedWife,
      family_members: members
    })
  }

  const handleDelete = () => {
    if (initialFamily?.household_id && initialFamily?.id && onDelete) {
      onDelete(initialFamily.household_id, initialFamily.id)
      setShowConfirmDelete(false)
      onCancel()
    }
  }

  // ✅ Fetch all voters in barangay once
  useEffect(() => {
    const fetchInitialVoters = async () => {
      const { data, error } = await supabase
        .from('voters')
        .select('id, fullname')
        .eq('barangay', location?.name)
        .eq('address', 'OZAMIZ CITY')

      if (!error && data) {
        // add fullname field for easier search
        const votersWithFullname = data.map((user) => ({
          ...user,
          fullname: user.fullname
        }))
        setAllVoters(votersWithFullname)
      }
    }

    if (location?.name) {
      fetchInitialVoters()
    }
  }, [location?.name])

  // Sync initialFamily → state when editing
  useEffect(() => {
    if (initialFamily) {
      setSelectedHusband(initialFamily.husband ?? null)
      setSelectedWife(initialFamily.wife ?? null)
      setMembers(initialFamily.family_members ?? [])
    } else {
      setSelectedHusband(null)
      setSelectedWife(null)
      setMembers([])
    }
    setHusbandOptions([])
    setWifeOptions([])
    setMemberOptions([])
    setHusbandQuery('')
    setWifeQuery('')
    setMemberQuery('')
    setSaving(false)
  }, [initialFamily, open])

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Family</DialogTitle>
          </DialogHeader>

          {/* Husband */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Husband</label>
            <input
              value={husbandQuery}
              onChange={(e) => setHusbandQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Husband name..."
            />
            {husbandOptions.length > 0 && (
              <ul className="border rounded mt-1 bg-white max-h-40 overflow-y-auto">
                {husbandOptions.map((v) => (
                  <li
                    key={v.id}
                    className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setSelectedHusband({
                        ...v,
                        voter_id: v.id,
                        is_registered: true
                      })
                      setHusbandOptions([])
                      setHusbandQuery('')
                    }}
                  >
                    {v.fullname}
                  </li>
                ))}
              </ul>
            )}
            {/* Add as non-registered option */}
            {husbandQuery && husbandOptions.length === 0 && (
              <button
                className="mt-1 text-sm text-blue-600"
                onClick={() => {
                  setSelectedHusband({
                    fullname: `${husbandQuery} (NR)`,
                    is_registered: false
                  })
                  setHusbandQuery('')
                }}
              >
                Add “{husbandQuery}” as Non-registered
              </button>
            )}
            {/* Show selected husband below */}
            {selectedHusband && (
              <div className="mt-2 text-sm flex items-center gap-2 border rounded px-2 py-1 bg-gray-50">
                <strong>{selectedHusband.fullname}</strong>
                <button
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setSelectedHusband(null)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Wife */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Wife</label>
            <input
              value={wifeQuery}
              onChange={(e) => setWifeQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Wife name..."
            />
            {wifeOptions.length > 0 && (
              <ul className="border rounded mt-1 bg-white max-h-40 overflow-y-auto">
                {wifeOptions.map((v) => (
                  <li
                    key={v.id}
                    className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setSelectedWife({
                        ...v,
                        voter_id: v.id,
                        is_registered: true
                      })
                      setWifeOptions([])
                      setWifeQuery('')
                    }}
                  >
                    {v.fullname}
                  </li>
                ))}
              </ul>
            )}
            {wifeQuery && wifeOptions.length === 0 && (
              <button
                className="mt-1 text-sm text-blue-600"
                onClick={() => {
                  setSelectedWife({
                    fullname: `${wifeQuery} (NR)`,
                    is_registered: false
                  })
                  setWifeQuery('')
                }}
              >
                Add “{wifeQuery}” as Non-registered
              </button>
            )}
            {selectedWife && (
              <div className="mt-2 text-sm flex items-center gap-2 border rounded px-2 py-1 bg-gray-50">
                <strong>
                  {selectedWife.fullname}{' '}
                  {!selectedWife.is_registered && '(NR)'}
                </strong>
                <button
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setSelectedWife(null)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Members */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Add Member</label>
            <input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Member name..."
            />
            {memberOptions.length > 0 && (
              <ul className="border rounded mt-1 bg-white max-h-40 overflow-y-auto">
                {memberOptions.map((v) => (
                  <li
                    key={v.id}
                    className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                    onClick={() =>
                      handleAddMember({ ...v, is_registered: true })
                    }
                  >
                    {v.fullname}
                  </li>
                ))}
              </ul>
            )}
            {memberQuery && memberOptions.length === 0 && (
              <button
                className="mt-1 text-sm text-blue-600"
                onClick={() =>
                  handleAddMember({
                    fullname: memberQuery,
                    is_registered: false
                  })
                }
              >
                Add “{memberQuery}” as Non-registered
              </button>
            )}
          </div>

          {/* Members List */}
          {members.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium">Family Members</h4>
              <ul className="mt-2 space-y-1">
                {members.map((m, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between items-center border px-2 py-1 rounded bg-gray-50"
                  >
                    <span>
                      {m.fullname} {!m.is_registered && '(NR)'}
                    </span>
                    <button
                      className="text-red-500 hover:text-red-700"
                      onClick={() =>
                        setMembers(members.filter((_, i) => i !== idx))
                      }
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between gap-2">
            {/* Show Delete only in edit mode */}
            {initialFamily && onDelete && (
              <Button
                variant="ghost"
                onClick={() => setShowConfirmDelete(true)}
              >
                Delete This Family
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" disabled={saving} onClick={onCancel}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={handleSubmit}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
          {/* <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Save</Button>
          </DialogFooter> */}
        </DialogContent>
      </Dialog>
      {/* Confirm Delete Modal */}
      <Dialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this family?</p>
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
