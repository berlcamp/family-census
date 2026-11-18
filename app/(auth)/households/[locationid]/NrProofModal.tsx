'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { shrinkProofImage } from '@/lib/shrinkProofImage'
import { supabase } from '@/lib/supabase/client'
import { Camera, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export type NrProofTarget = {
  personType: 'husband' | 'wife' | 'member'
  familyId: number
  memberId: number | null
  name: string
  /** Status of this person's latest proof, if any. */
  status?: 'pending' | 'approved' | 'rejected' | null
  reviewNote?: string | null
}

export type SavedProof = {
  id: number
  family_id: number
  person_type: 'husband' | 'wife' | 'member'
  member_id: number | null
  fullname: string
  status: 'pending'
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`

/** Upload a Voter's Certificate photo for an NR person on a household card. */
export default function NrProofModal({
  target,
  onClose,
  onSaved
}: {
  target: NrProofTarget | null
  onClose: () => void
  onSaved: (proof: SavedProof) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preparing, setPreparing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photo, setPhoto] = useState<{
    blob: Blob
    url: string
    originalSize: number
  } | null>(null)

  // Start empty every time the modal opens for someone.
  useEffect(() => {
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return null
    })
  }, [target])

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },
    [photo]
  )

  const pick = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    try {
      const { blob } = await shrinkProofImage(file)
      setPhoto({ blob, url: URL.createObjectURL(blob), originalSize: file.size })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPreparing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const upload = async () => {
    if (!target || !photo) return
    setUploading(true)
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      const form = new FormData()
      form.append('personType', target.personType)
      form.append('familyId', String(target.familyId))
      if (target.memberId) form.append('memberId', String(target.memberId))
      form.append(
        'file',
        photo.blob,
        photo.blob.type === 'image/webp' ? 'proof.webp' : 'proof.jpg'
      )
      const res = await fetch('/api/nr-proofs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: form
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? res.statusText)
      toast.success('Proof submitted. It will show as registered once approved.')
      onSaved(body.proof)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const busy = preparing || uploading

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !uploading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proof of registration</DialogTitle>
          <DialogDescription>
            Upload a photo of the <b>Voter&apos;s Certificate</b> of{' '}
            <b className="text-gray-900">{target?.name}</b>. Once approved by an
            admin, this person shows as registered (from NR).
          </DialogDescription>
        </DialogHeader>

        {target?.status === 'pending' && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            A proof is already waiting for approval. Uploading a new photo replaces it.
          </p>
        )}
        {target?.status === 'rejected' && (
          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">
            The last proof was rejected
            {target.reviewNote ? `: “${target.reviewNote}”` : '.'} You can upload a
            new photo.
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />

        {photo ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt="Voter's Certificate preview"
              className="max-h-[50vh] w-full rounded border object-contain"
            />
            <p className="text-xs text-gray-500">
              Reduced from {kb(photo.originalSize)} to {kb(photo.blob.size)}. Make
              sure the name and details are readable.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Choose another photo
            </Button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {preparing ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" /> Preparing photo…
              </>
            ) : (
              <>
                <Camera className="h-6 w-6" /> Take or choose a photo
              </>
            )}
          </button>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={uploading} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!photo || busy} onClick={() => void upload()}>
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit proof
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
