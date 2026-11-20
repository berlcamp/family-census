import { BadgeCheck, BarChart, CogIcon, FileCheck2, FileSpreadsheet, HeartHandshake, Home, ListChecks, Users } from 'lucide-react'
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
import OwnerMark from './OwnerMark'
import { usePathname } from 'next/navigation'

export function AppSidebar() {
  const locations = useAppSelector((state) => state.locationsList.value)
  const user = useAppSelector((state) => state.user.user)

  const pathname = usePathname()

  // Menu items. Restricted ones get a "!" (seen by the owner only):
  // red = owner only, blue = owner and province admins.
  const items: {
    title: string
    url: string
    icon: typeof Home
    mark?: 'red' | 'blue'
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
    ...(isOwner(user?.email) || user?.type === 'province admin'
      ? [
          {
            title: 'AP Members',
            mark: 'blue' as const,
            url: '/ap-members',
            icon: BadgeCheck
          }
        ]
      : []),
    ...(isOwner(user?.email) ||
    user?.type === 'province admin' ||
    user?.type === 'super admin'
      ? [
          {
            title: 'NR Proofs',
            url: '/nr-proofs',
            icon: FileCheck2
          }
        ]
      : []),
    ...(isOwner(user?.email)
      ? [
          {
            title: 'Settings',
            mark: 'red' as const,
            url: '/settings',
            icon: CogIcon
          },
          {
            title: 'AP Review',
            mark: 'red' as const,
            url: '/ap-review',
            icon: ListChecks
          },
          {
            title: 'Reports',
            mark: 'red' as const,
            url: '/reports',
            icon: FileSpreadsheet
          },
          {
            title: 'Married-name Review',
            mark: 'red' as const,
            url: '/married-review',
            icon: HeartHandshake
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
                      {item.mark && <OwnerMark tone={item.mark} className="ml-auto" />}
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
