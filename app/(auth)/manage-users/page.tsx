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
import {
  MUNICIPALITIES,
  OWNER_EMAILS,
  USER_TYPES,
  userManagementScope
} from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { User } from '@/types'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useDebounce } from 'use-debounce'

const PAGE_SIZE = 50
const ALL = '__all__'
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID

type ManagedUser = User & { last_signin_at?: string | null }

type FormState = {
  id?: string
  email: string
  name: string
  type: string
  address: string
  is_active: boolean
}

type Barangay = { id: number; name: string }
type Assignment = { id: number; location_id: number; is_editor: boolean | null }

const SORTS = {
  last_signin: { label: 'Last sign-in: latest first', column: 'last_signin_at' },
  created: { label: 'Date added: newest first', column: 'created_at' }
} as const
type SortKey = keyof typeof SORTS

/** "Nov 9, 2026, 3:04 PM" plus a relative hint like "2 days ago". */
function formatSignin(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  const absolute = date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
  const minutes = Math.round((Date.now() - date.getTime()) / 60000)
  const relative =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 1440
          ? `${Math.round(minutes / 60)} hr ago`
          : `${Math.round(minutes / 1440)} days ago`
  return { absolute, relative }
}

const typeLabel = (type?: string) =>
  USER_TYPES.find((t) => t.value === type)?.label ?? type ?? '—'

export default function ManageUsersPage() {
  const router = useRouter()
  const me = useAppSelector((state) => state.user.user)

  const scope = useMemo(
    () =>
      userManagementScope({
        email: me?.email,
        type: me?.type,
        address: me?.address
      }),
    [me?.email, me?.type, me?.address]
  )
  const allowedTypes = useMemo(
    () => USER_TYPES.filter((t) => scope.types.includes(t.value)),
    [scope.types]
  )

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [barangaysByUser, setBarangaysByUser] = useState<Map<number, string[]>>(
    new Map()
  )
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounce(search.trim(), 300)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [addressFilter, setAddressFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [sort, setSort] = useState<SortKey>('last_signin')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    email: '',
    name: '',
    type: 'viewer',
    address: '',
    is_active: true
  })
  const [saving, setSaving] = useState(false)

  // Barangay assignments for encoders (type "user").
  const [barangays, setBarangays] = useState<Barangay[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editor, setEditor] = useState(true)
  const [editorTouched, setEditorTouched] = useState(false)
  const [barangayFilter, setBarangayFilter] = useState('')

  useEffect(() => {
    if (me && !scope.canManage) router.replace('/')
  }, [me, scope.canManage, router])

  // Reset to the first page whenever a filter changes.
  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, typeFilter, addressFilter, statusFilter, sort])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('users')
      .select(
        'id, name, email, type, address, is_active, created_at, last_signin_at',
        { count: 'exact' }
      )
      .eq('org_id', ORG_ID)

    // Scope: what this person is allowed to see at all.
    if (scope.municipality) query = query.eq('address', scope.municipality)
    if (!scope.isOwner) {
      query = query
        .in('type', scope.types)
        .not('email', 'in', `(${OWNER_EMAILS.map((e) => `"${e}"`).join(',')})`)
    }

    // Filters chosen on the page.
    if (typeFilter !== ALL) query = query.eq('type', typeFilter)
    if (!scope.municipality && addressFilter !== ALL) {
      query = query.eq('address', addressFilter)
    }
    if (statusFilter !== ALL) {
      query = query.eq('is_active', statusFilter === 'active')
    }
    const term = debouncedSearch.replace(/[(),*%\\"']/g, ' ').trim()
    if (term) query = query.or(`name.ilike.*${term}*,email.ilike.*${term}*`)

    const { data, error, count } = await query
      .order(SORTS[sort].column, { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) {
      console.error(error)
      toast.error('Failed to load users')
      setLoading(false)
      return
    }

    const rows = (data ?? []) as unknown as ManagedUser[]
    setUsers(rows)
    setTotal(count ?? 0)

    // Barangays for the encoders on this page.
    const encoderIds = rows.filter((u) => u.type === 'user').map((u) => u.id)
    const map = new Map<number, string[]>()
    if (encoderIds.length > 0) {
      const { data: links } = await supabase
        .from('location_users')
        .select('user_id, location:location_id(name)')
        .in('user_id', encoderIds)
      for (const link of (links ?? []) as unknown as {
        user_id: number
        location: { name: string } | null
      }[]) {
        if (!link.location?.name) continue
        const list = map.get(link.user_id) ?? []
        list.push(link.location.name)
        map.set(link.user_id, list)
      }
    }
    setBarangaysByUser(map)
    setLoading(false)
  }, [scope, typeFilter, addressFilter, statusFilter, debouncedSearch, sort, page])

  useEffect(() => {
    if (scope.canManage) fetchUsers()
  }, [scope.canManage, fetchUsers])

  // Load the barangays of the municipality chosen in the dialog.
  useEffect(() => {
    if (!dialogOpen || form.type !== 'user' || !form.address) {
      setBarangays([])
      return
    }
    let cancelled = false
    supabase
      .from('locations')
      .select('id, name')
      .eq('address', form.address)
      .eq('org_id', ORG_ID)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) toast.error('Failed to load barangays')
        setBarangays((data ?? []) as Barangay[])
      })
    return () => {
      cancelled = true
    }
  }, [dialogOpen, form.type, form.address])

  const resetAssignments = (rows: Assignment[]) => {
    setAssignments(rows)
    setSelected(new Set(rows.map((r) => r.location_id)))
    setEditor(rows.length === 0 || rows.every((r) => r.is_editor !== false))
    setEditorTouched(false)
    setBarangayFilter('')
  }

  const openAdd = () => {
    setForm({
      email: '',
      name: '',
      type: allowedTypes[0]?.value ?? 'viewer',
      address: scope.municipality ?? '',
      is_active: true
    })
    resetAssignments([])
    setDialogOpen(true)
  }

  const openEdit = async (u: ManagedUser) => {
    setForm({
      id: u.id,
      email: u.email ?? '',
      name: u.name ?? '',
      type: u.type ?? 'viewer',
      address: u.address ?? scope.municipality ?? '',
      is_active: u.is_active
    })
    resetAssignments([])
    setDialogOpen(true)

    if (u.type === 'user') {
      const { data, error } = await supabase
        .from('location_users')
        .select('id, location_id, is_editor')
        .eq('user_id', u.id)
      if (error) toast.error('Failed to load barangay assignments')
      resetAssignments((data ?? []) as Assignment[])
    }
  }

  const isSelf =
    !!form.id && form.email.toLowerCase() === me?.email?.toLowerCase()

  /** Make location_users match the checked barangays of this municipality. */
  const syncAssignments = async (userId: number) => {
    const visible = new Set(barangays.map((b) => b.id))
    const existing = new Map(assignments.map((a) => [a.location_id, a]))

    // Only touch barangays shown in the dialog; assignments elsewhere stay.
    const toDelete = assignments
      .filter((a) => visible.has(a.location_id) && !selected.has(a.location_id))
      .map((a) => a.id)
    const toAdd = [...selected].filter((id) => !existing.has(id))
    const toKeep = assignments
      .filter((a) => selected.has(a.location_id))
      .map((a) => a.id)

    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('location_users')
        .delete()
        .in('id', toDelete)
      if (error) throw error
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from('location_users').insert(
        toAdd.map((location_id) => ({
          user_id: userId,
          location_id,
          is_editor: editor,
          is_importer: false,
          is_disabled: false
        }))
      )
      if (error) throw error
    }
    if (editorTouched && toKeep.length > 0) {
      const { error } = await supabase
        .from('location_users')
        .update({ is_editor: editor })
        .in('id', toKeep)
      if (error) throw error
    }
  }

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
    if (!isSelf && !scope.types.includes(form.type as never)) {
      toast.error('You are not allowed to manage that user type')
      return
    }
    if (scope.municipality && form.address !== scope.municipality) {
      toast.error(`You can only manage users in ${scope.municipality}`)
      return
    }
    if (form.type === 'user' && selected.size === 0) {
      toast.error('Assign at least one barangay')
      return
    }

    setSaving(true)
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existing && String(existing.id) !== String(form.id)) {
        toast.error('A user with this email already exists')
        return
      }

      const values = {
        email,
        name: form.name.trim() || email,
        type: form.type,
        address: form.address,
        is_active: isSelf ? true : form.is_active
      }

      let userId = Number(form.id)
      if (form.id) {
        const { error } = await supabase
          .from('users')
          .update(values)
          .eq('id', form.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('users')
          .insert({ ...values, org_id: ORG_ID })
          .select('id')
          .single()
        if (error) throw error
        userId = data.id
      }

      if (form.type === 'user') await syncAssignments(userId)

      toast.success(form.id ? 'User updated' : 'User added')
      setDialogOpen(false)
      fetchUsers()
    } catch (error) {
      console.error(error)
      toast.error(form.id ? 'Failed to update user' : 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (target: ManagedUser) => {
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

  if (!me || !scope.canManage) return null

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const typeHelp = USER_TYPES.find((t) => t.value === form.type)?.help
  const shownBarangays = barangayFilter
    ? barangays.filter((b) =>
        b.name.toLowerCase().includes(barangayFilter.toLowerCase())
      )
    : barangays

  const subtitle = scope.isOwner
    ? 'All users, every type and municipality.'
    : scope.municipality
      ? `Viewers and encoders in ${scope.municipality}.`
      : 'Viewers, encoders and super admins in every municipality.'

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Manage Users</h1>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <Button onClick={openAdd}>Add User</Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {allowedTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!scope.municipality && (
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
        )}
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
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORTS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORTS[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 text-left text-sm">Name / Email</th>
              <th className="border px-3 py-2 text-left text-sm">Type</th>
              <th className="border px-3 py-2 text-left text-sm">
                Municipality / Barangays
              </th>
              <th className="border px-3 py-2 text-left text-sm">
                <button
                  type="button"
                  onClick={() => setSort('last_signin')}
                  className="font-semibold hover:underline"
                  title="Sort by last sign-in, latest first"
                >
                  Last sign-in{sort === 'last_signin' ? ' ↓' : ''}
                </button>
              </th>
              <th className="border px-3 py-2 text-center text-sm">Status</th>
              <th className="border px-3 py-2 text-center text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className={loading ? 'opacity-50' : ''}>
            {!loading && users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border px-3 py-6 text-center text-gray-500"
                >
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const signin = formatSignin(u.last_signin_at)
              const assigned = barangaysByUser.get(Number(u.id)) ?? []
              return (
                <tr key={u.id}>
                  <td className="border px-3 py-2 text-sm">
                    <div className="font-medium">{u.name}</div>
                    {u.email !== u.name && (
                      <div className="text-xs text-gray-500">{u.email}</div>
                    )}
                  </td>
                  <td className="border px-3 py-2 text-sm">
                    {typeLabel(u.type)}
                  </td>
                  <td className="border px-3 py-2 text-sm">
                    <div>{u.address ?? '—'}</div>
                    {u.type === 'user' && (
                      <div
                        className="text-xs text-gray-500"
                        title={assigned.join(', ')}
                      >
                        {assigned.length === 0
                          ? 'No barangay assigned'
                          : assigned.length <= 3
                            ? assigned.join(', ')
                            : `${assigned.slice(0, 3).join(', ')} +${assigned.length - 3} more`}
                      </div>
                    )}
                  </td>
                  <td className="border px-3 py-2 text-sm whitespace-nowrap">
                    {signin ? (
                      <>
                        <div>{signin.absolute}</div>
                        <div className="text-xs text-gray-500">
                          {signin.relative}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
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
              )
            })}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                  {allowedTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Municipality</label>
              {scope.municipality ? (
                <Input value={scope.municipality} disabled />
              ) : (
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
              )}
            </div>

            {form.type === 'user' && form.address && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Barangays ({selected.size} selected)
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() =>
                        setSelected(
                          new Set([
                            ...selected,
                            ...shownBarangays.map((b) => b.id)
                          ])
                        )
                      }
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        const hide = new Set(shownBarangays.map((b) => b.id))
                        setSelected(
                          new Set([...selected].filter((id) => !hide.has(id)))
                        )
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {barangays.length > 8 && (
                  <Input
                    placeholder="Filter barangays…"
                    value={barangayFilter}
                    onChange={(e) => setBarangayFilter(e.target.value)}
                  />
                )}
                <div className="max-h-48 overflow-y-auto rounded border p-2 grid grid-cols-2 gap-1">
                  {shownBarangays.length === 0 && (
                    <p className="col-span-2 text-xs text-gray-500">
                      No barangays found.
                    </p>
                  )}
                  {shownBarangays.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(b.id)}
                        onChange={(e) => {
                          const next = new Set(selected)
                          if (e.target.checked) next.add(b.id)
                          else next.delete(b.id)
                          setSelected(next)
                        }}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editor}
                    onChange={(e) => {
                      setEditor(e.target.checked)
                      setEditorTouched(true)
                    }}
                  />
                  Editor (can add and edit households in these barangays)
                </label>
              </div>
            )}

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
              {typeHelp} They log in with Google using this email.
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
