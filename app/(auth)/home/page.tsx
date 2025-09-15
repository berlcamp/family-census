'use client'

import { Greeting } from '@/components/Greeting'
import { useAppSelector } from '@/lib/redux/hook'

import Link from 'next/link'

export default function Page() {
  const user = useAppSelector((state) => state.user.user)
  const locations = useAppSelector((state) => state.locationsList.value)

  return (
    <div className="w-full">
      <div className="mt-20 grid gap-4">
        <div className="text-center">
          <Greeting name={user?.name ?? ''} />
        </div>
        {user?.type === 'super admin xx' && (
          <div className="space-x-4 m-4 space-y-4 border p-4 rounded-xl">
            {locations?.map((item, idx) => (
              <Link
                key={idx}
                href={`/${item.id}`}
                className="space-x-1 space-y-4"
              >
                <button
                  type="button"
                  className="w-4 h-4 rounded-full relative"
                  style={{ backgroundColor: item.color }}
                ></button>

                <span className="">{item.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
