import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { VoterRemarks as VoterRemarksType } from '@/types'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

export default function VoterRemarks({ voterId }: { voterId: number }) {
  // Remarks
  const [remarks, setRemarks] = useState<VoterRemarksType[]>([])
  const [newRemark, setNewRemark] = useState('')

  const user = useAppSelector((state) => state.user.user)

  const handleViewRemarks = async () => {
    const { data, error } = await supabase
      .from('voter_remarks')
      .select()
      .eq('voter_id', voterId)
      .order('id', { ascending: false })

    if (error) {
      console.error('Failed to fetch remarks:', error)
      return []
    }

    setRemarks(data)
  }

  const handleAddRemark = async () => {
    const { data, error } = await supabase
      .from('voter_remarks')
      .insert({
        voter_id: voterId,
        remarks: newRemark.trim(),
        author: user?.name,
        user_id: user?.system_user_id
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to add remark:', error)
      toast.error('Error adding remark.')
    } else {
      setNewRemark('')
      setRemarks((prev) => [data, ...prev])
    }
  }

  useEffect(() => {
    handleViewRemarks()
  })
  return (
    <div>
      {/* Remark Input */}
      <div className="space-y-2 py-4 border-t">
        <Textarea
          value={newRemark}
          onChange={(e) => setNewRemark(e.target.value)}
          placeholder="Add a remark..."
        />
        <Button size="xs" onClick={handleAddRemark}>
          Add Remark
        </Button>
      </div>

      {/* Remark List */}
      <div className="pt-4 border-t space-y-2">
        <strong>Remarks:</strong>
        {remarks.length === 0 && (
          <div className="text-gray-500 italic text-xs">No remarks yet.</div>
        )}
        <ul className="max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
          {remarks?.map((r, i) => (
            <li key={i} className="text-xs px-2 py-1 rounded">
              <div>{r.remarks}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {new Date(r.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
