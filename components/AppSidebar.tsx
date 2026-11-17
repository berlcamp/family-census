import { BarChart, CogIcon, FileSpreadsheet, Home, ListChecks, Users } from 'lucide-react'
import { isOwner, userManagementScope } from '@/lib/constants'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { useAppSelector } from '@/lib/redux/hook'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AppSidebar() {
  const locations = useAppSelector((state) => state.locationsList.value)
  const user = useAppSelector((state) => state.user.user)

  const pathname = usePathname()

  // Menu items. ownerOnly items (berlcamp@gmail.com only) get a red "!".
  const items: {
    title: string
    url: string
    icon: typeof Home
    ownerOnly?: boolean
  }[] = [
    {
      title: 'Home',
      url: '/home',
      icon: Home
    },
    ...(user?.type === 'super admin' || user?.type === 'province admin'
      ? [
          {
            title: 'Dashboard',
            url: '/dashboard',
            icon: BarChart
          }
        ]
      : []),
    ...(isOwner(user?.email)
      ? [
          {
            title: 'Settings',
            ownerOnly: true,
            url: '/settings',
            icon: CogIcon
          },
          {
            title: 'AP Review',
            ownerOnly: true,
            url: '/ap-review',
            icon: ListChecks
          },
          {
            title: 'Reports',
            ownerOnly: true,
            url: '/reports',
            icon: FileSpreadsheet
          }
        ]
      : []),
    ...(userManagementScope(user).canManage
      ? [
          {
            title: 'Manage Users',
            url: '/manage-users',
            icon: Users
          }
        ]
      : [])
    // {
    //   title: 'Data Processing Agreement',
    //   url: '/data-processing-agreement',
    //   icon: Calendar
    // },
    // {
    //   title: 'Data Privacy',
    //   url: '/privacy-policy',
    //   icon: Search
    // },
    // {
    //   title: 'Settings',
    //   url: '#',
    //   icon: Settings
    // }
  ]

  return (
    <Sidebar className="pt-13">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon className="text-gray-400" />
                      <span className="text-gray-300">{item.title}</span>
                      {item.ownerOnly && (
                        <span
                          className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white"
                          title="Only visible to the owner"
                          aria-label="Owner only"
                        >
                          !
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.type !== 'viewer' && (
        <SidebarGroup>
          <SidebarGroupLabel className="border-t rounded-none border-gray-600">
            {locations.length > 0 && 'Locations'}
          </SidebarGroupLabel>
          <SidebarGroupContent className="pb-20">
            <SidebarMenu>
              {locations.map((item, idx) => {
                const isActive = pathname === `/${item.id}`

                return (
                  <SidebarMenuItem
                    key={idx}
                    className="rounded-xl"
                    style={{
                      backgroundColor: isActive ? '#49494a' : 'transparent'
                    }}
                  >
                    <SidebarMenuButton asChild>
                      <Link href={`/${item.id}`}>
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full relative"
                          style={{ backgroundColor: item.color }}
                        ></button>
                        <span className="text-gray-300">{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
