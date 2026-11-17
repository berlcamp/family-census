'use client'

import { useAppSelector } from '@/lib/redux/hook'
import { Home, LayoutDashboard, Users } from 'lucide-react'
import Link from 'next/link'

/** Barangay tabs: Overview, Households, Service Providers. */
export default function VerticalMenu({ activeTab }: { activeTab: string }) {
  const location = useAppSelector((state) => state.location.selectedLocation)
  const user = useAppSelector((state) => state.user.user)

  const tabs = [
    { key: 'overview', label: 'Overview', href: `/${location?.id}`, icon: LayoutDashboard },
    { key: 'households', label: 'Households', href: `/households/${location?.id}`, icon: Home },
    ...(location?.address !== 'OZAMIZ CITY' || user?.system_user_id == 2
      ? [
          {
            key: 'serviceproviders',
            label: 'Service Providers',
            href: `/serviceproviders/${location?.id}`,
            icon: Users
          }
        ]
      : [])
  ]

  return (
    <nav
      aria-label="Barangay sections"
      className="mt-4 flex overflow-x-auto border-y border-gray-200 bg-gray-100 px-4 dark:border-gray-700 dark:bg-gray-900"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key
        const Icon = tab.icon
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-5 py-2.5 text-sm transition-colors ${
              active
                ? 'border-blue-600 bg-white font-semibold text-blue-700 dark:bg-gray-800 dark:text-blue-400'
                : 'border-transparent text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
