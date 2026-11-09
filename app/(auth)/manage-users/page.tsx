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
import { isOwner, MUNICIPALITIES, USER_TYPES } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { User } from '@/types'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useDebounce } from 'use-debounce'

const PAGE_SIZE = 50
const ALL = '__all__'

type FormState = {
  id?: string
  email: string
  name: string
  type: string
  address: string
  is_active: boolean
}

const emptyForm = (type: string): FormState => ({
  email: '',
  name: '',
  type,
  address: '',
  is_active: true
})

const typeLabel = (type?: string) =>
  USER_TYPES.find((t) => t.value === type)?.label ?? type ?? '—'

export default function ManageUsersPage() {
  const router = useRouter()
  const me = useAppSelector((state) => state.user.user)

  // The owner manages everyone; other super admins manage viewers only.
  const owner = isOwner(me?.email)
  const allowed = me?.type === 'super admin' || owner

  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search.trim(), 300)
  const [typeFilter, setTypeFilter] = useState(owner ? ALL : 'viewer')
  const [addressFilter, setAddressFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm('viewer'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (me && !allowed) router.replace('/')
  }, [me, allowed, router])

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, typeFilter, addressFilter, statusFilter])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('users')
      .select('id, name, email, type, address, is_active, created_at', {
        count: 'exact'
      })
      .eq('org_id', process.env.NEXT_PUBLIC_ORG_ID)

    const type = owner ? typeFilter : 'viewer'
    if (type !== ALL) query = query.eq('type', type)
    if (addressFilter !== ALL) query = query.eq('address', addressFilter)
    if (statusFilter !== ALL) {
      query = query.eq('is_active', statusFilter === 'active')
    }
    const term = debouncedSearch.replace(/[(),*%\\"']/g, ' ').trim()
    if (term) query = query.or(`name.ilike.*${term}*,email.ilike.*${term}*`)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) {
      console.error(error)
      toast.error('Failed to load users')
    } else {
      setUsers((data ?? []) as User[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [owner, typeFilter, addressFilter, statusFilter, debouncedSearch, page])

  useEffect(() => {
    if (allowed) fetchUsers()
  }, [allowed, fetchUsers])

  const openAdd = () => {
    setForm(emptyForm('viewer'))
    setDialogOpen(true)
  }

  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      email: u.email ?? '',
      name: u.name ?? '',
      type: u.type ?? 'viewer',
      address: u.address ?? '',
      is_active: u.is_active
    })
    setDialogOpen(true)
  }

  const isSelf = !!form.id && form.email.toLowerCase() === me?.email?.toLowerCase()

  const handleSave = async () => {
    const email = form.email.trim().toLowerCase()
    if (!email.includes('@')) {
      toast.error('Please enter a valid email')
      return
    }
    if (!form.address) {
      toast.error('Please select a municipality')
      return
    }
    const type = owner ? form.type : 'viewer'

    setSaving(true)

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing && String(existing.id) !== String(form.id)) {
      toast.error('A user with this email already exists')
      setSaving(false)
      return
    }

    const values = {
      email,
      name: form.name.trim() || email,
      type,
      address: form.address,
      is_active: isSelf ? true : form.is_active
    }

    const { error } = form.id
      ? await supabase.from('users').update(values).eq('id', form.id)
      : await supabase
          .from('users')
          .insert({ ...values, org_id: process.env.NEXT_PUBLIC_ORG_ID })

    if (error) {
      console.error(error)
      toast.error(form.id ? 'Failed to update user' : 'Failed to add user')
    } else {
      toast.success(form.id ? 'User updated' : 'User added')
      setDialogOpen(false)
      fetchUsers()
    }
    setSaving(false)
  }

  const toggleActive = async (target: User) => {
    if (target.email?.toLowerCase() === me?.email?.toLowerCase()) {
      toast.error("You can't deactivate your own account")
      return
    }
    const { error } = await supabase
      .from('users')
      .update({ is_active: !target.is_active })
      .eq('id', target.id)

    if (error) {
      console.error(error)
      toast.error('Failed to update user')
    } else {
      toast.success(target.is_active ? 'User deactivated' : 'User activated')
      fetchUsers()
    }
  }

  if (!me || !allowed) return null

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const typeHelp = USER_TYPES.find((t) => t.value === form.type)?.help

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Manage Users</h1>
          <p className="text-sm text-gray-500">
            {owner
              ? 'All users, every type and municipality.'
              : 'Viewer accounts (search only, limited to one municipality).'}
          </p>
        </div>
        <Button onClick={openAdd}>Add User</Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {owner && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {USER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={addressFilter} onValueChange={setAddressFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All municipalities</SelectItem>
            {MUNICIPALITIES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Active and inactive</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 text-left text-sm">Name / Email</th>
              <th className="border px-3 py-2 text-left text-sm">Type</th>
              <th className="border px-3 py-2 text-left text-sm">Municipality</th>
              <th className="border px-3 py-2 text-center text-sm">Status</th>
              <th className="border px-3 py-2 text-center text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className={loading ? 'opacity-50' : ''}>
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="border px-3 py-6 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border px-3 py-2 text-sm">
                  <div className="font-medium">{u.name}</div>
                  {u.email !== u.name && (
                    <div className="text-xs text-gray-500">{u.email}</div>
                  )}
                </td>
                <td className="border px-3 py-2 text-sm">{typeLabel(u.type)}</td>
                <td className="border px-3 py-2 text-sm">{u.address ?? '—'}</td>
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
                <td className="border px-3 py-2 text-center whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(u)}
                    aria-label="Edit user"
                  >
                    <Pencil className="size-4" />
                  </Button>
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
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
        <span>
          {total} user{total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit User' : 'Add User'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Google Email</label>
              <Input
                placeholder="user@gmail.com"
                value={form.email}
                disabled={isSelf}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Juan Dela Cruz (optional)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {owner && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={form.type}
                  disabled={isSelf}
                  onValueChange={(type) => setForm({ ...form, type })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Municipality</label>
              <Select
                value={form.address}
                onValueChange={(address) => setForm({ ...form, address })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select municipality" />
                </SelectTrigger>
                <SelectContent>
                  {MUNICIPALITIES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.id && !isSelf && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                />
                Active (can log in)
              </label>
            )}

            <div className="text-xs text-gray-500">
              {owner ? typeHelp : USER_TYPES[0].help} They log in with Google
              using this email.
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : form.id ? 'Save' : 'Add User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
