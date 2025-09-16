/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
  onCancel: () => void
  initialFamily?: any
}

export default function FamilyModal({
  open,
  onSave,
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

  console.log('initialFamily', initialFamily)
  const location = useAppSelector((state) => state.location.selectedLocation)

  // debounce queries
  const [debouncedHusbandQuery] = useDebounce(husbandQuery, 400)
  const [debouncedWifeQuery] = useDebounce(wifeQuery, 400)
  const [debouncedMemberQuery] = useDebounce(memberQuery, 400)

  // fetch voters
  const fetchVoters = async (query: string, setOptions: any) => {
    if (!query.trim()) {
      setOptions([])
      return
    }

    const { data, error } = await supabase
      .from('voters')
      .select('id, fullname, barangay')
      .eq('barangay', location?.name)
      .ilike('fullname', `%${query}%`)
      .limit(10)

    if (!error) {
      setOptions(data || [])
    }
  }

  // husband search
  useEffect(() => {
    if (debouncedHusbandQuery) {
      fetchVoters(debouncedHusbandQuery, setHusbandOptions)
    } else {
      setHusbandOptions([])
    }
  }, [debouncedHusbandQuery])

  // wife search
  useEffect(() => {
    if (debouncedWifeQuery) {
      fetchVoters(debouncedWifeQuery, setWifeOptions)
    } else {
      setWifeOptions([])
    }
  }, [debouncedWifeQuery])

  // member search
  useEffect(() => {
    if (debouncedMemberQuery) {
      fetchVoters(debouncedMemberQuery, setMemberOptions)
    } else {
      setMemberOptions([])
    }
  }, [debouncedMemberQuery])

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
          voter.is_registered === false
            ? `${voter.fullname} (NR)`
            : voter.fullname,
        relation: '',
        is_registered: voter.is_registered !== false
      }
    ])
    setMemberQuery('')
    setMemberOptions([])
  }

  const handleSubmit = () => {
    onSave({
      id: initialFamily?.id,
      husband: selectedHusband,
      wife: selectedWife,
      family_members: members
    })
  }

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
  }, [initialFamily, open])

  return (
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
            placeholder="Search husband..."
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
                  {v.fullname} ({v.barangay})
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
            placeholder="Search wife..."
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
                  {v.fullname} ({v.barangay})
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
              <strong>{selectedWife.fullname}</strong>
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
            placeholder="Search member..."
          />
          {memberOptions.length > 0 && (
            <ul className="border rounded mt-1 bg-white max-h-40 overflow-y-auto">
              {memberOptions.map((v) => (
                <li
                  key={v.id}
                  className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleAddMember({ ...v, is_registered: true })}
                >
                  {v.fullname} ({v.barangay})
                </li>
              ))}
            </ul>
          )}
          {memberQuery && memberOptions.length === 0 && (
            <button
              className="mt-1 text-sm text-blue-600"
              onClick={() =>
                handleAddMember({ fullname: memberQuery, is_registered: false })
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
                  <span>{m.fullname}</span>
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

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
