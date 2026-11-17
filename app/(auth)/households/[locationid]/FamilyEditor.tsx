/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/lib/redux/hook'
import { Check, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import PersonPicker from './PersonPicker'
import { useBarangayVoters, VoterOption } from './useBarangayVoters'

/** Small badge shown after a person's name. */
export function RegisteredBadge({ registered }: { registered: boolean }) {
  return registered ? (
    <span
      className="ml-1 inline-block rounded bg-green-600 px-1 py-px text-[10px] font-semibold leading-tight text-white align-middle"
      title="Registered voter"
    >
      R
    </span>
  ) : (
    <span
      className="ml-1 inline-block rounded bg-gray-400 px-1 py-px text-[10px] font-semibold leading-tight text-white align-middle"
      title="Not registered"
    >
      NR
    </span>
  )
}

/** AP member according to the AP crossmatch. Shown only when AP. */
export function ApBadge() {
  return (
    <span
      className="ml-1 inline-block rounded bg-blue-700 px-1 py-px text-[10px] font-semibold leading-tight text-white align-middle"
      title="AP member (AP crossmatch)"
    >
      AP
    </span>
  )
}

/** Asenso (the "A" checkbox in the family editor). */
export function AsensoBadge() {
  return (
    <span
      className="ml-1 inline-block rounded bg-orange-500 px-1 py-px text-[10px] font-semibold leading-tight text-white align-middle"
      title="Asenso"
    >
      A
    </span>
  )
}

/** Explains the badges shown after names on the household cards. */
export function BadgeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
      <span className="font-medium text-gray-700">Legend:</span>
      <span>
        <RegisteredBadge registered /> Registered voter
      </span>
      <span>
        <RegisteredBadge registered={false} /> Not registered
      </span>
      <span>
        <ApBadge /> AP member
      </span>
      <span>
        <AsensoBadge /> Asenso
      </span>
    </div>
  )
}

/** Name followed by its badges, as shown on the card. */
export function PersonLine({
  name,
  registered,
  ap,
  asenso,
  className = ''
}: {
  name: string
  registered: boolean
  ap?: boolean | null
  asenso?: boolean | null
  className?: string
}) {
  return (
    <div className={className}>
      {name}
      {/* Badges wrap to the next line together, never one by one. */}
      <span className="whitespace-nowrap">
        <RegisteredBadge registered={registered} />
        {ap === true && <ApBadge />}
        {asenso === true && <AsensoBadge />}
      </span>
    </div>
  )
}

type Slot = VoterOption | null

/**
 * Add / edit a family directly inside the household card.
 * `onSave` returns true when the family was saved, so the editor can close.
 */
export default function FamilyEditor({
  initialFamily,
  onSave,
  onDelete,
  onCancel,
  onDirtyChange
}: {
  initialFamily: any | null
  onSave: (family: any) => Promise<boolean>
  onDelete?: () => Promise<void>
  onCancel: () => void
  /** Told whether the form differs from what it opened with. */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const location = useAppSelector((s) => s.location.selectedLocation)
  const voters = useBarangayVoters(true, location?.address, location?.name)

  const [husband, setHusband] = useState<Slot>(initialFamily?.husband ?? null)
  const [wife, setWife] = useState<Slot>(initialFamily?.wife ?? null)
  const [members, setMembers] = useState<VoterOption[]>(
    initialFamily?.family_members ?? []
  )
  // families.sp (old "Family of SP" tag): no longer edited here, but an
  // existing value is kept as is when the family is saved.
  const sp: string = initialFamily?.sp ?? ''
  const [allowNonRegistered, setAllowNonRegistered] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Unsaved changes? Compared with what the editor opened with.
  const [initialSnapshot] = useState(() =>
    JSON.stringify([
      initialFamily?.husband ?? null,
      initialFamily?.wife ?? null,
      initialFamily?.family_members ?? []
    ])
  )
  const dirty =
    JSON.stringify([husband, wife, members]) !== initialSnapshot
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const anyRegistered =
    !!husband?.voter_id ||
    !!wife?.voter_id ||
    members.some((m) => m.is_registered && !!m.voter_id)
  const nobodyEncoded = !husband && !wife && members.length === 0

  const addMember = (p: VoterOption) => {
    const name = p.fullname.trim().toLowerCase()
    if (members.some((m) => m.fullname.trim().toLowerCase() === name)) {
      toast.error(`${p.fullname} is already a member of this family.`)
      return
    }
    setMembers((prev) => [
      ...prev,
      {
        voter_id: p.voter_id ?? null,
        fullname: p.fullname,
        relation: '',
        is_registered: p.is_registered !== false,
        asenso: true
      }
    ])
  }

  const save = async () => {
    if (nobodyEncoded) {
      toast.error('Add at least one person to the family.')
      return
    }
    setSaving(true)
    try {
      const ok = await onSave({
        id: initialFamily?.id,
        sp,
        husband,
        wife,
        family_members: members,
        allowNonRegistered
      })
      if (ok) onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="mb-3 rounded border-2 border-yellow-400 bg-yellow-50 p-2 text-sm shadow-sm"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !saving) {
          const target = e.target as HTMLElement
          // Esc inside a search box only clears that box.
          if (target.tagName !== 'INPUT') onCancel()
        }
      }}
    >
      <div className="mb-2 text-xs font-semibold uppercase text-yellow-800">
        {initialFamily ? 'Edit family' : 'New family'}
      </div>

      <SpouseSlot
        label="Husband/Head #1"
        placeholder="Husband / Head #1: Lastname, Firstname"
        person={husband}
        voters={voters}
        autoFocus={!initialFamily}
        onChange={setHusband}
      />
      <SpouseSlot
        label="Wife/Head #2"
        placeholder="Wife / Head #2: Lastname, Firstname"
        person={wife}
        voters={voters}
        onChange={setWife}
      />

      <div className="mt-2">
        <div className="text-xs font-medium text-gray-600">
          Members ({members.length})
        </div>
        <ul className="mt-1 space-y-1">
          {members.map((m, idx) => (
            <li key={m.member_id ?? `new-${idx}-${m.fullname}`}>
              <PersonRow
                name={m.fullname}
                registered={!!m.is_registered}
                asenso={m.asenso === true}
                onAsensoChange={(checked) =>
                  setMembers((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, asenso: checked } : x))
                  )
                }
                removeLabel={`Remove ${m.fullname}`}
                onRemove={() =>
                  setMembers((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-1">
          <PersonPicker
            voters={voters}
            placeholder="+ Add member: Lastname, Firstname"
            onPick={addMember}
          />
        </div>
      </div>

      {!anyRegistered && !nobodyEncoded && (
        <label className="mt-2 flex items-center gap-2 text-xs text-red-700">
          <input
            type="checkbox"
            checked={allowNonRegistered}
            onChange={(e) => setAllowNonRegistered(e.target.checked)}
          />
          Nobody in this family is a registered voter. Save anyway.
        </label>
      )}

      <div className="mt-3 flex items-center gap-2">
        {initialFamily && onDelete && !confirmDelete && (
          <Button
            size="xs"
            variant="ghost"
            className="text-red-600"
            disabled={saving}
            onClick={() => setConfirmDelete(true)}
          >
            Delete family
          </Button>
        )}
        {confirmDelete && (
          <span className="flex items-center gap-1 text-xs text-red-700">
            Delete this family?
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

function SpouseSlot({
  label,
  placeholder,
  person,
  voters,
  autoFocus,
  onChange
}: {
  label: string
  placeholder: string
  person: Slot
  voters: VoterOption[]
  autoFocus?: boolean
  onChange: (p: Slot) => void
}) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 text-xs font-medium text-gray-600">{label}</div>
      {person ? (
        <PersonRow
          name={person.fullname}
          registered={!!person.voter_id}
          asenso={person.is_asenso === true}
          onAsensoChange={(checked) => onChange({ ...person, is_asenso: checked })}
          removeLabel={`Remove ${label.toLowerCase()}`}
          onRemove={() => onChange(null)}
        />
      ) : (
        <PersonPicker
          voters={voters}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onPick={(p) => onChange({ ...p, is_asenso: true })}
        />
      )}
    </div>
  )
}

/**
 * One person in the editor: name on top; underneath, the registered badge
 * and the Asenso switch (a pill you click: orange "A Asenso ✓" when on,
 * grey "Not Asenso" when off). Trash on the right removes the person.
 */
function PersonRow({
  name,
  registered,
  asenso,
  onAsensoChange,
  removeLabel,
  onRemove
}: {
  name: string
  registered: boolean
  asenso: boolean
  onAsensoChange: (checked: boolean) => void
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-2 rounded bg-white/70 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">{name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="-ml-1">
            <RegisteredBadge registered={registered} />
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={asenso}
            title={asenso ? 'Asenso (click to unset)' : 'Not Asenso (click to set)'}
            onClick={() => onAsensoChange(!asenso)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11px] font-semibold leading-tight transition-colors ${
              asenso
                ? 'border-orange-500 bg-orange-500 text-white hover:bg-orange-600'
                : 'border-gray-300 bg-white text-gray-500 hover:border-orange-400 hover:text-orange-600'
            }`}
          >
            {asenso ? (
              <>
                A Asenso <Check className="h-3 w-3" />
              </>
            ) : (
              'Not Asenso'
            )}
          </button>
        </div>
      </div>
      <RemoveButton label={removeLabel} onClick={onRemove} />
    </div>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="text-red-500 hover:text-red-700"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
