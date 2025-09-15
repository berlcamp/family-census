'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { Member, MemberRemarks } from '@/types'
import { useEffect, useState } from 'react'

// type Voter = {
//   id: number
//   fullname: string
//   barangay: string | null
//   address: string | null
//   precinct: string | null
//   category: string | null
// }

// type Remark = {
//   id: number
//   remarks: string
//   created_at: string
//   author: string | null
// }

export default function MemberModal({
  member,
  onClose
}: {
  member: Member | null
  onClose: () => void
}) {
  const [remarks, setRemarks] = useState<MemberRemarks[]>([])
  const [newRemark, setNewRemark] = useState('')
  const [saving, setSaving] = useState(false)

  const user = useAppSelector((state) => state.user.user)

  // Load remarks when voter changes
  useEffect(() => {
    if (!member) return
    fetchRemarks(member.id)
  }, [member])

  const fetchRemarks = async (voterId: number) => {
    const { data, error } = await supabase
      .from('member_remarks')
      .select('*')
      .eq('member_id', voterId)
      .order('created_at', { ascending: false })

    if (error) console.error('Fetch remarks error:', error)
    else setRemarks(data ?? [])
  }

  const handleSaveRemark = async () => {
    if (!newRemark.trim() || !member) return
    setSaving(true)

    const { error } = await supabase.from('member_remarks').insert({
      member_id: member.id,
      remarks: newRemark,
      user_id: user?.system_user_id,
      author: user?.name,
      details: member
    })

    if (error) {
      console.error('Insert remark error:', error)
    } else {
      setNewRemark('')
      fetchRemarks(member.id)
    }
    setSaving(false)
  }

  return (
    <Dialog open={!!member} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {member?.fullname} {member?.lastname}, {member?.firstname}{' '}
            {member?.middlename}
          </DialogTitle>
        </DialogHeader>

        {member && (
          <div className="space-y-4">
            {/* Voter details */}
            <div className="text-sm space-y-2">
              <p>
                <strong>Address:</strong> {member.barangay},{' '}
                {member.municipality} Misamis Occidental
              </p>
              <p>
                <strong>Birthday:</strong> {member.birthday}
              </p>
            </div>

            {/* Remarks */}
            <div>
              <h3 className="font-semibold mt-4 mb-2">Remarks</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {remarks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No remarks yet.
                  </p>
                ) : (
                  remarks.map((r) => (
                    <div key={r.id} className="p-2 border rounded-md">
                      <div className="flex items-start justify-between space-y-1">
                        <div className="text-sm">
                          <p className="font-medium">{r.remarks} </p>
                        </div>
                        <Badge className="text-xs" variant="outline">
                          {r.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.author} • {new Date(r.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add remark */}
            <div className="space-y-2">
              <Textarea
                placeholder="Add a remark..."
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
              />
              <Button onClick={handleSaveRemark} disabled={saving}>
                {saving ? 'Saving...' : 'Add Remark'}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
