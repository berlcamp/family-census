'use client'

import OwnerMark from '@/components/OwnerMark'
import { isOwner } from '@/lib/constants'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

interface LocationSetting {
  id: number
  address: string
  /** Households / families can be added and edited. */
  enable_edit: boolean
  /** The barangays' purok lists (Overview tab) can be edited. */
  enable_purok_edit: boolean
  /** Everyone on the households pages sees the User logs download. */
  show_user_logs: boolean
  /** Everyone on the households pages sees the AP badges. */
  show_ap_badge: boolean
}

type SettingKey =
  | 'enable_edit'
  | 'enable_purok_edit'
  | 'show_user_logs'
  | 'show_ap_badge'

const COLUMNS =
  'id, address, enable_edit, enable_purok_edit, show_user_logs, show_ap_badge'

const SWITCHES: {
  key: SettingKey
  label: string
  hint: string
  /** Owner-level visibility switch (marked with "!"). */
  owner?: boolean
}[] = [
  {
    key: 'enable_edit',
    label: 'Household editing',
    hint: 'Add and edit households and families'
  },
  {
    key: 'enable_purok_edit',
    label: 'Purok editing',
    hint: "Add, rename and delete a barangay's puroks"
  },
  {
    key: 'show_user_logs',
    label: 'Show user logs',
    hint: 'Off: only the owner sees them',
    owner: true
  },
  {
    key: 'show_ap_badge',
    label: 'Show AP badges',
    hint: 'Off: only the owner and province admins',
    owner: true
  }
]

export default function SettingsPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()

  const [settings, setSettings] = useState<LocationSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Only the owner (OWNER_EMAILS, i.e. berlcamp@gmail.com) can access
  const allowed = isOwner(user?.email)

  useEffect(() => {
    if (!user) return
    if (!allowed) router.replace('/')
  }, [router, user, allowed])

  useEffect(() => {
    if (!allowed) return
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('location_settings')
        .select(COLUMNS)
        .order('address')

      if (error) {
        toast.error('Error loading settings')
        console.error(error)
      } else {
        setSettings(data)
      }
      setLoading(false)
    }
    loadSettings()
  }, [allowed])

  const toggle = async (setting: LocationSetting, key: SettingKey) => {
    const id = `${setting.id}-${key}`
    setSaving(id)
    const { data, error } = await supabase
      .from('location_settings')
      .update({ [key]: !setting[key] })
      .eq('id', setting.id)
      .select(COLUMNS)
      .single()
    setSaving(null)

    if (error) {
      toast.error('Failed to update setting')
      console.error(error)
      return
    }
    setSettings((prev) => prev.map((s) => (s.id === setting.id ? data : s)))
    const label = SWITCHES.find((s) => s.key === key)?.label
    toast.success(`${label} ${data[key] ? 'enabled' : 'disabled'} for ${data.address}`)
  }

  if (!allowed) return null

  return (
    <div className="space-y-4 p-4 pt-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-50">
          Settings <OwnerMark />
        </h1>
        <p className="text-sm text-gray-500">What encoders may change, per municipality.</p>
      </div>

      <section className="overflow-x-auto rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Municipality / City</th>
              {SWITCHES.map((s) => (
                <th key={s.key} className="px-4 py-2 text-left font-medium">
                  <div className="flex items-center gap-1.5">
                    {s.label}
                    {s.owner && <OwnerMark />}
                  </div>
                  <div className="text-[11px] font-normal text-gray-400">{s.hint}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-t dark:border-gray-800">
                    <td className="px-4 py-3">
                      <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                    </td>
                    {SWITCHES.map((s) => (
                      <td key={s.key} className="px-4 py-3">
                        <div className="h-5 w-9 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                      </td>
                    ))}
                  </tr>
                ))
              : settings.map((setting) => (
                  <tr key={setting.id} className="border-t dark:border-gray-800">
                    <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-100">
                      {setting.address}
                    </td>
                    {SWITCHES.map((s) => (
                      <td key={s.key} className="px-4 py-2.5">
                        <Switch
                          checked={setting[s.key]}
                          disabled={saving === `${setting.id}-${s.key}`}
                          label={`${s.label} for ${setting.address}`}
                          onChange={() => toggle(setting, s.key)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Switch({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span
        className={`text-xs ${checked ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}`}
      >
        {disabled ? 'Saving…' : checked ? 'On' : 'Off'}
      </span>
    </button>
  )
}
