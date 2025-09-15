'use client'

import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { MemberRemarks, Voter, VoterRemarks } from '@/types'
import { Bell } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import AdminMemberModal from './AdminMemberModal'
import AdminVoterModal from './AdminVoterModal'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<VoterRemarks[]>([])
  const [memberNotifications, setMemberNotifications] = useState<
    MemberRemarks[]
  >([])
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null)
  const [selectedMember, setSelectedMember] = useState<{
    id: number
    fullname: string
    firstname: string
    middlename: string
    lastname: string
    barangay: string
    municipality: string
    birthday: string
  } | null>(null)
  const [showList, setShowList] = useState(false) // 👈 state for dropdown toggle

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // initial fetch
    fetchNotifications()
    fetchMemberNotifications()

    // subscribe to real-time inserts
    const channel = supabase
      .channel('remarks-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'asenso', table: 'member_remarks' },
        (payload) => {
          console.log('New member remark :', payload) // 👈 useful for debugging
          fetchMemberNotifications()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'asenso', table: 'voter_remarks' },
        (payload) => {
          console.log('New voter remarks:', payload) // 👈 useful for debugging
          fetchNotifications()
        }
      )
      .subscribe()

    // cleanup on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, []) // 👈 add dependencies

  // ✅ Close on outside click or ESC
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowList(false)
      }
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowList(false)
    }

    if (showList) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEsc)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showList])

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('voter_remarks')
      .select('*,voter: voter_id (*)')
      .eq('status', 'Pending Approval')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch notifications error:', error)
    } else {
      setNotifications(data)
    }
  }

  const fetchMemberNotifications = async () => {
    const { data, error } = await supabase
      .from('member_remarks')
      .select()
      .eq('status', 'Pending Approval')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Fetch notifications error:', error)
    } else {
      console.log('d', data)
      setMemberNotifications(data)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 🔔 Bell button */}
      <Button
        variant="ghost"
        size="icon"
        className="relative text-white"
        onClick={() => setShowList((prev) => !prev)} // 👈 toggle list
      >
        <Bell className="h-5 w-5" />
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
          {notifications.length + memberNotifications.length}
        </span>
      </Button>

      {/* Dropdown-style notifications list (only when toggled) */}
      {showList && (
        <div className="absolute right-0 mt-2 w-72 max-h-92 overflow-y-auto bg-white border rounded-md shadow-lg z-50">
          {memberNotifications?.map((n) => (
            <button
              key={n.id}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
              onClick={() => {
                setSelectedMember(n.details)
                // setShowList(false) // 👈 close list when opening modal
              }}
            >
              <p className="text-sm">
                New remarks for {n.details.fullname} {n.details.lastname}{' '}
                {n.details.firstname} {n.details.middlename}
              </p>
              <p className="text-xs text-gray-500 truncate">{n.remarks}</p>
              <p className="text-[10px] text-gray-400">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </button>
          ))}
          {notifications?.map((n) => (
            <button
              key={n.id}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
              onClick={() => {
                setSelectedVoter(n.voter)
                // setShowList(false) // 👈 close list when opening modal
              }}
            >
              <p className="text-sm">New remarks for {n.voter.fullname}</p>
              <p className="text-xs text-gray-500 truncate">{n.remarks}</p>
              <p className="text-[10px] text-gray-400">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ✅ Show modal when a voter is selected */}
      {selectedVoter && (
        <AdminVoterModal
          voter={selectedVoter}
          onClose={() => setSelectedVoter(null)}
        />
      )}
      {selectedMember && (
        <AdminMemberModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  )
}
