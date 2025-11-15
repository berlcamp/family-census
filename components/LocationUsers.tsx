import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { Location, LocationUser as LocationUserType } from '@/types'
import { DropdownMenuCheckboxItemProps } from '@radix-ui/react-dropdown-menu'
import { PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import AddMemberModal from './AddMemberModal'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

type Checked = DropdownMenuCheckboxItemProps['checked']

function LocationUser({ user }: { user: LocationUserType }) {
  const [editor, setEditor] = useState<Checked>(user.is_editor)

  const handleRoleUpdate = async (updates: Partial<LocationUserType>) => {
    const { error } = await supabase
      .from('location_users')
      .update(updates)
      .eq('id', user.id)

    if (!error) {
      toast.success('Successfully saved')
    } else {
      toast.error('Failed to save')
    }
  }

  const toggleEditor = (checked: Checked) => {
    setEditor(checked)
    void handleRoleUpdate({ is_editor: !!checked })
  }

  // const toggleImporter = (checked: Checked) => {
  //   setImporter(checked)
  //   void handleRoleUpdate({ is_importer: !!checked })
  // }

  return (
    <div className="flex space-x-2 hover:bg-gray-100 py-2 border-t">
      <div>
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-gray-300 dark:bg-gray-700 font-semibold text-xs">
            {user.user.name
              ?.split(' ')
              .map((w) => w[0]?.toUpperCase())
              .join('')
              .slice(0, 2) ?? '?'}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1">
        <div className="text-xs">{user.user.name}</div>
        <div className="text-xs font-light">{user.user.email}</div>
      </div>
      <div className="">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="text-xs">
              Role: Viewer {editor ? '+ Editor' : ''}{' '}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={editor}
              onCheckedChange={toggleEditor}
            >
              Editor
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={true} disabled>
              Viewer
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export default function LocationUsers({
  location
}: {
  location: Location | null
}) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<LocationUserType[]>([])
  const [refresh, setRefresh] = useState(0)

  const user = useAppSelector((state) => state.user.user)

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('location_users')
        .select('*, user:user_id(*)')
        .eq('location_id', location?.id)
        .order('id', { ascending: false })

      if (!error) {
        console.log('users fetched')
        setUsers(data)
      }
    }
    void fetchData()
  }, [location, refresh])

  return (
    <>
      {user?.type === 'super admin' && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setOpen(true)}
              className="w-10 h-10 rounded-full"
            >
              <PlusIcon className="w-5 h-5" />
            </Button>
            <span className="text-sm text-gray-700">Add User</span>
          </div>
        </div>
      )}
      <div className="mt-4">
        {users?.map((user) => <LocationUser key={user.id} user={user} />)}
      </div>
      <AddMemberModal
        users={users}
        setRefresh={setRefresh} // pass the function
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
