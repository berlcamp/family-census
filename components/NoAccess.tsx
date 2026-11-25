import { Home, Lock, UserX, CalendarX } from 'lucide-react'
import Link from 'next/link'

type Reason = 'closed' | 'not_assigned' | 'disabled' | 'default'

const MESSAGES: Record<
  Reason,
  { icon: typeof Lock; title: string; body: string }
> = {
  // Household editing and viewing are both off for the municipality.
  closed: {
    icon: CalendarX,
    title: 'Encoding is closed for now',
    body: 'Adding and viewing households is turned off for now.'
  },
  not_assigned: {
    icon: Lock,
    title: 'This barangay is not assigned to you',
    body:
      'You can only open the barangays assigned to your account. If you should have ' +
      'access to this one, please ask your administrator to assign it to you.'
  },
  disabled: {
    icon: UserX,
    title: 'Your access to this barangay is turned off',
    body:
      'Your administrator has turned off your access to this barangay. Please contact ' +
      'them if you think this is a mistake.'
  },
  default: {
    icon: Lock,
    title: 'You can’t open this page',
    body: 'Your account doesn’t have access to this page. Please contact your administrator.'
  }
}

/** Friendly "no access" screen, with the reason and a way back home. */
export default function NoAccess({ reason = 'default' }: { reason?: Reason }) {
  const { icon: Icon, title, body } = MESSAGES[reason]
  return (
    <div className="flex w-full justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-50">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {body}
        </p>
        <Link
          href="/home"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
        >
          <Home className="h-4 w-4" /> Back to home
        </Link>
      </div>
    </div>
  )
}
