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
      className="mt-4 flex gap-1 overflow-x-auto border-b border-gray-200 px-4 dark:border-gray-700"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key
        const Icon = tab.icon
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 rounded-t-md border px-4 py-2 text-sm transition-colors ${
              active
                ? 'border-gray-200 border-b-white bg-white font-semibold text-blue-700 shadow-[inset_0_2px_0_0_var(--color-blue-600)] dark:border-gray-700 dark:border-b-transparent dark:bg-transparent dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
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
