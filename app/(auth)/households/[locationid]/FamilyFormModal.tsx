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
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from 'use-debounce'

interface Voter {
  id?: number
  voter_id?: number
  fullname: string
  barangay?: string | null
  address?: string | null
  from_rpc?: boolean | null
  is_registered?: boolean
}

interface FamilyFormProps {
  open: boolean
  onSave: (family: any) => Promise<void>
  onDelete?: (householdId: number, familyId: number) => void
  onCancel: () => void
  initialFamily?: any
}

type AbortRef = { current: AbortController | null }

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
  const [allowNonRegistered, setAllowNonRegistered] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const location = useAppSelector((state) => state.location.selectedLocation)

  const [searchingHusband, setSearchingHusband] = useState(false)

  const [searchingWife, setSearchingWife] = useState(false)

  const [searchingMember, setSearchingMember] = useState(false)

  // debounce queries
  const [debouncedHusbandQuery] = useDebounce(husbandQuery, 400)
  const [debouncedWifeQuery] = useDebounce(wifeQuery, 400)
  const [debouncedMemberQuery] = useDebounce(memberQuery, 400)

  const husbandSearchAbort = useRef<AbortController | null>(null)
  const wifeSearchAbort = useRef<AbortController | null>(null)
  const memberSearchAbort = useRef<AbortController | null>(null)

  // Helper: shared search function
  const searchPerson = async (
    query: string,
    all: Voter[],
    onSearching?: (val: boolean) => void,
    abortRef?: AbortRef
  ): Promise<Voter[]> => {
    if (!query.trim()) {
      return []
    }

    onSearching?.(true)

    const searchWords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

    // 1️⃣ Local search
    const localMatches = all.filter((user) => {
      const fullName = `${user.fullname || ''}`.toLowerCase()
      return searchWords.every((word) => fullName.includes(word))
    })

    if (localMatches.length > 0) {
      onSearching?.(false)
      return localMatches
    }

    const trimmedQuery = query.trim()
    // Split query into words
    const words = trimmedQuery
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

    // 🚫 Skip if less than 2 words
    if (words.length < 2) {
      onSearching?.(false)
      return []
    }

    // Abort previous RPC
    if (abortRef?.current) {
      abortRef.current.abort()
    }

    // New controller
    const controller = new AbortController()
    if (abortRef) abortRef.current = controller

    // 2️⃣ Fallback RPC
    const { data, error } = await supabase.rpc(
      'search_voters_similar',
      {
        query,
        limit_count: 2
      },
      { signal: controller.signal } as any
    )

    onSearching?.(false)

    if (!error && data?.length > 0) {
      return data.map((d: any) => ({
        ...d,
        from_rpc: true
      }))
    }

    return []
  }

  // husband
  useEffect(() => {
    const run = async () => {
      const results = await searchPerson(
        debouncedHusbandQuery,
        allVoters,
        setSearchingHusband,
        husbandSearchAbort
      )
      setHusbandOptions(results || [])
    }
    run()
  }, [debouncedHusbandQuery, allVoters])

  // wife
  useEffect(() => {
    const run = async () => {
      const results = await searchPerson(
        debouncedWifeQuery,
        allVoters,
        setSearchingWife,
        wifeSearchAbort
      )
      setWifeOptions(results)
    }
    run()
  }, [debouncedWifeQuery, allVoters])

  // member
  useEffect(() => {
    const run = async () => {
      const results = await searchPerson(
        debouncedMemberQuery,
        allVoters,
        setSearchingMember,
        memberSearchAbort
      )
      setMemberOptions(results)
    }
    run()
  }, [debouncedMemberQuery, allVoters])

  // Add member handler
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

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave({
        id: initialFamily?.id,
        husband: selectedHusband,
        wife: selectedWife,
        family_members: members,
        allowNonRegistered
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (initialFamily?.household_id && initialFamily?.id && onDelete) {
      onDelete(initialFamily.household_id, initialFamily.id)
      setShowConfirmDelete(false)
      onCancel()
    }
  }

  // fetch all voters in barangay once
  useEffect(() => {
    const fetchInitialVoters = async () => {
      if (location?.address === 'CONCEPCION') {
        const { data, error } = await supabase
          .from('voters')
          .select('id, fullname')
          .eq('address', location?.address)

        if (!error && data) {
          setAllVoters(data)
        }
      } else {
        const { data, error } = await supabase
          .from('voters')
          .select('id, fullname')
          .eq('barangay', location?.name)
          .eq('address', location?.address)

        if (!error && data) {
          setAllVoters(data)
        }
      }
    }

    if (location?.name) {
      fetchInitialVoters()
    }
  }, [location?.address, location?.name])

  // sync when editing
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Family</DialogTitle>
          </DialogHeader>

          {/* HUSBAND */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Husband</label>
            <input
              value={husbandQuery}
              onChange={(e) => setHusbandQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Lastname, Firstname Middlename"
            />
            {!searchingHusband && husbandOptions.length > 0 && (
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
                    {v.from_rpc && v.barangay && (
                      <span className="text-xs text-gray-500 ml-2">
                        (registered from {v.barangay}
                        {v.address ? `, ${v.address}` : ''})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Show “Searching from other places…” */}
            {searchingHusband && (
              <p className="text-xs text-gray-500 mt-1">Searching…</p>
            )}
            {!searchingHusband &&
              husbandQuery &&
              (husbandOptions.length === 0 ||
                husbandOptions.every((v) => v.from_rpc)) && (
                <button
                  className="mt-1 text-sm text-blue-600"
                  onClick={() => {
                    setSelectedHusband({
                      fullname: `${husbandQuery}`,
                      is_registered: false
                    })
                    setHusbandOptions([])
                    setHusbandQuery('')
                  }}
                >
                  Add “{husbandQuery}” as Non-registered
                </button>
              )}
            {selectedHusband && (
              <div className="mt-2 text-sm flex items-center gap-2 border rounded px-2 py-1 bg-yellow-100">
                <strong>
                  {selectedHusband.fullname}{' '}
                  {!selectedHusband.is_registered && '(NR)'}
                </strong>
                <button
                  className="text-red-500 hover:text-red-700"
                  onClick={() => setSelectedHusband(null)}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* WIFE */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Wife</label>
            <input
              value={wifeQuery}
              onChange={(e) => setWifeQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Lastname, Firstname Middlename"
            />
            {!searchingWife && wifeOptions.length > 0 && (
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
                    {v.from_rpc && v.barangay && (
                      <span className="text-xs text-gray-500 ml-2">
                        (registered from {v.barangay}
                        {v.address ? `, ${v.address}` : ''})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {/* Show “Searching from other places…” */}
            {searchingWife && (
              <p className="text-xs text-gray-500 mt-1">Searching…</p>
            )}
            {!searchingWife &&
              wifeQuery &&
              (wifeOptions.length === 0 ||
                wifeOptions.every((v) => v.from_rpc)) && (
                <button
                  className="mt-1 text-sm text-blue-600"
                  onClick={() => {
                    setSelectedWife({
                      fullname: `${wifeQuery}`,
                      is_registered: false
                    })
                    setWifeOptions([])
                    setWifeQuery('')
                  }}
                >
                  Add “{wifeQuery}” as Non-registered
                </button>
              )}
            {selectedWife && (
              <div className="mt-2 text-sm flex items-center gap-2 border rounded px-2 py-1 bg-yellow-100">
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

          {/* MEMBERS */}
          <div className="mb-3">
            <label className="block text-sm font-medium">Add Member</label>
            <input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              className="w-full border px-2 py-1 rounded"
              placeholder="Lastname, Firstname Middlename"
            />
            {!searchingMember && memberOptions.length > 0 && (
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
                    {v.from_rpc && v.barangay && (
                      <span className="text-xs text-gray-500 ml-2">
                        (registered from {v.barangay}
                        {v.address ? `, ${v.address}` : ''})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {searchingMember && (
              <p className="text-xs text-gray-500 mt-1">Searching…</p>
            )}
            {!searchingMember &&
              memberQuery &&
              (memberOptions.length > 0 ||
                memberOptions.every((v) => v.from_rpc)) && (
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

          {/* MEMBERS LIST */}
          {members.length > 0 && (
            <div className="mb-3">
              <h4 className="font-medium">Family Members</h4>
              <ul className="mt-2 space-y-1">
                {members.map((m, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between items-center border px-2 py-1 rounded bg-yellow-100"
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

          <div className="flex items-center mb-2">
            <input
              id="allowNonRegistered"
              type="checkbox"
              checked={allowNonRegistered}
              onChange={(e) => setAllowNonRegistered(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="allowNonRegistered" className="text-sm">
              Allow saving even if no members are registered
            </label>
          </div>

          <div className="flex justify-between gap-2">
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
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
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
