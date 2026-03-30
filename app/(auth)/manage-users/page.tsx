'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { User } from '@/types'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

const addresses = [
  'SAPANG DALAGA',
  'LOPEZ JAENA',
  'BONIFACIO',
  'ALORAN',
  'CALAMBA',
  'PLARIDEL',
  'JIMENEZ',
  'CLARIN',
  'PANAON',
  'DON VICTORIANO CHIONGBIAN',
  'TUDELA',
  'BALIANGAO',
  'SINACABAN',
  'CITY OF OROQUIETA',
  'OZAMIZ CITY',
  'CONCEPCION',
  'CITY OF TANGUB'
]

export default function ManageUsersPage() {
  const router = useRouter()
  const user = useAppSelector((state) => state.user.user)

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.type !== 'super admin') {
      router.replace('/')
      return
    }
    fetchUsers()
  }, [user, router])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('type', 'viewer')
      .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      toast.error('Failed to load users')
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  const handleAddUser = async () => {
    if (!email.trim() || !address) {
      toast.error('Please fill in all fields')
      return
    }

    if (!email.includes('@')) {
      toast.error('Please enter a valid email')
      return
    }

    setSaving(true)

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existing) {
      toast.error('A user with this email already exists')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('users').insert({
      email: email.trim().toLowerCase(),
      name: email.trim().toLowerCase(),
      type: 'viewer',
      address,
      org_id: process.env.NEXT_PUBLIC_ORG_ID,
      is_active: true
    })

    if (error) {
      console.error(error)
      toast.error('Failed to add user')
    } else {
      toast.success('User added successfully')
      setEmail('')
      setAddress('')
      setDialogOpen(false)
      fetchUsers()
    }
    setSaving(false)
  }

  const toggleActive = async (targetUser: User) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !targetUser.is_active })
      .eq('id', targetUser.id)

    if (error) {
      console.error(error)
      toast.error('Failed to update user')
    } else {
      toast.success(
        targetUser.is_active ? 'User deactivated' : 'User activated'
      )
      fetchUsers()
    }
  }

  if (user?.type !== 'super admin') return null

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Manage Users</h1>
        <Button onClick={() => setDialogOpen(true)}>Add User</Button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="text-gray-500">No viewer users yet.</div>
      ) : (
        <table className="w-full border-collapse border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 text-left text-sm">Email</th>
              <th className="border px-3 py-2 text-left text-sm">Address</th>
              <th className="border px-3 py-2 text-center text-sm">Status</th>
              <th className="border px-3 py-2 text-center text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border px-3 py-2 text-sm">{u.email}</td>
                <td className="border px-3 py-2 text-sm">{u.address}</td>
                <td className="border px-3 py-2 text-center text-sm">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      u.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="border px-3 py-2 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(u)}
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Viewer User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Google Email</label>
              <Input
                placeholder="user@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Address</label>
              <Select value={address} onValueChange={setAddress}>
                <SelectTrigger>
                  <SelectValue placeholder="Select address" />
                </SelectTrigger>
                <SelectContent>
                  {addresses.map((addr) => (
                    <SelectItem key={addr} value={addr}>
                      {addr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-gray-400">
              This user will be able to log in with Google and use search only.
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleAddUser} disabled={saving}>
                {saving ? 'Adding...' : 'Add User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
