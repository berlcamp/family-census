'use client'

import { isOwner } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'

/**
 * Small "!" next to things with restricted access. Only the owner
 * (berlcamp@gmail.com) ever sees it; for everyone else it renders nothing.
 *   red  (default): only the owner can use it
 *   blue: the owner and province admins
 */
export default function OwnerMark({
  tone = 'red',
  title,
  className = ''
}: {
  tone?: 'red' | 'blue'
  title?: string
  className?: string
}) {
  const user = useAppSelector((s) => s.user.user)
  if (!isOwner(user?.email)) return null
  const label =
    title ??
    (tone === 'blue'
      ? 'Only visible to province admins and the owner'
      : 'Only visible to the owner')
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
        tone === 'blue' ? 'bg-blue-600' : 'bg-red-600'
      } align-middle text-[10px] font-bold leading-none text-white ${className}`}
    >
      !
    </span>
  )
}
