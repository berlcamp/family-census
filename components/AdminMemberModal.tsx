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
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { MemberRemarks } from '@/types'
import { useEffect, useState } from 'react'

export default function AdminMemberModal({
  member,
  onClose
}: {
  member: {
    id: number
    fullname: string
    firstname: string
    middlename: string
    lastname: string
    barangay: string
    municipality: string
    birthday: string
  } | null
  onClose: () => void
}) {
  const [remarks, setRemarks] = useState<MemberRemarks[]>([])
  const [loading, setLoading] = useState(false)

  const user = useAppSelector((state) => state.user.user)

  useEffect(() => {
    if (!member) return
    fetchRemarks(member.id)
  }, [member])

  const fetchRemarks = async (voterId: number) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('member_remarks')
      .select('*')
      .eq('member_id', voterId)
      .order('created_at', { ascending: false })

    if (error) console.error('Fetch remarks error:', error)
    else setRemarks(data ?? [])
    setLoading(false)
  }

  const handleApprove = async (remarkId: number) => {
    const { error } = await supabase
      .from('member_remarks')
      .update({ status: 'Approved' })
      .eq('id', remarkId)

    if (error) {
      console.error('Approve remark error:', error)
    } else {
      fetchRemarks(member!.id)
    }
  }

  return (
    <Dialog open={!!member} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {member?.fullname} {member?.lastname} {member?.firstname}{' '}
            {member?.middlename}
          </DialogTitle>
        </DialogHeader>

        {member && (
          <div className="space-y-4">
            {/* Voter details */}
            <div className="text-sm space-y-2">
              <p>
                <strong>Address:</strong> {member.barangay},{' '}
                {member.municipality}
              </p>
              <p>
                <strong>Birthday:</strong>
                {member.birthday}
              </p>
            </div>

            {/* Remarks */}
            <div>
              <h3 className="font-semibold mb-2">Remarks</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : remarks.length === 0 ? (
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

                      {/* ✅ Approve button only for Pending Approval */}
                      {r.status === 'Pending Approval' &&
                        user?.type !== 'user' && (
                          <Button
                            size="xxs"
                            className="mt-2"
                            onClick={() => handleApprove(r.id)}
                          >
                            Mark as Approved
                          </Button>
                        )}
                    </div>
                  ))
                )}
              </div>
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
