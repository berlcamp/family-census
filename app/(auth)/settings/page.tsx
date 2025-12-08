/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/lib/redux/hook'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const user = useAppSelector((s) => s.user.user)
  const router = useRouter()

  const [settings, setSettings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  // Only province admin can access
  useEffect(() => {
    if (!user) return
    if (user.type !== 'province admin') router.replace('/')
  }, [router, user])

  // Load all location settings
  useEffect(() => {
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('location_settings')
        .select('*')
        .neq('address', 'OZAMIZ CITY')
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
  }, [])

  // Toggle enable_edit
  const handleToggle = async (setting: any) => {
    setSavingId(setting.id)

    const { data, error } = await supabase
      .from('location_settings')
      .update({ enable_edit: !setting.enable_edit })
      .eq('id', setting.id)
      .select()
      .single()

    setSavingId(null)

    if (error) {
      toast.error('Failed to update setting')
      console.error(error)
      return
    }

    setSettings((prev) => prev.map((s) => (s.id === setting.id ? data : s)))

    toast.success(data.enable_edit ? 'Editing enabled' : 'Editing disabled')
  }

  if (loading) return <div className="p-4">Loading...</div>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Location Edit Settings</h1>

      <div className="space-y-3">
        {settings.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between border p-3 rounded-lg"
          >
            <div className="font-medium">{s.address}</div>

            <Button
              onClick={() => handleToggle(s)}
              variant={s.enable_edit ? 'destructive' : 'default'}
              disabled={savingId === s.id}
            >
              {savingId === s.id
                ? 'Saving...'
                : s.enable_edit
                  ? 'Disable Edit'
                  : 'Enable Edit'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
