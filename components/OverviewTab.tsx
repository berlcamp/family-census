'use client'

import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import { setLocation } from '@/lib/redux/locationSlice'
import { updateList } from '@/lib/redux/locationsSlice'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import LocationUsers from './LocationUsers'
import { Button } from './ui/button'

const COLORS = [
  'blue',
  'yellow',
  'orange',
  'brown',
  'pink',
  'red',
  'gray',
  'violet'
]

export const OverviewTab = () => {
  const location = useAppSelector((state) => state.location.selectedLocation)

  const [selectedColor, setSelectedColor] = useState(location?.color || 'gray')
  const [loading, setLoading] = useState(false)
  const [showSave, setShowSave] = useState(false)

  const dispatch = useAppDispatch()

  const handleSave = async () => {
    if (!location) return

    if (loading) return

    setLoading(true)
    const { error } = await supabase
      .from('locations')
      .update({
        color: selectedColor
      })
      .eq('id', location.id)
      .select()

    setLoading(false)

    if (error) {
      toast.error(error.message)
    } else {
      dispatch(
        updateList({
          color: selectedColor,
          org_id: location.org_id,
          id: location.id
        })
      ) // ✅ Update Redux with new data
      dispatch(
        setLocation({
          ...location,
          color: selectedColor,
          id: location.id
        })
      ) // ✅ Update Redux with new data
      toast.success('Successfully saved')
    }
  }

  // Update state if selected location changes
  useEffect(() => {
    setSelectedColor(location?.color || 'gray')
  }, [location])

  // Detect unsaved changes
  useEffect(() => {
    const hasChanges = selectedColor !== (location?.color || '')
    setShowSave(hasChanges)
  }, [selectedColor, location])

  return (
    <div className="lg:grid grid-cols-3 min-h-screen">
      <div className="p-4 flex flex-col gap-4 lg:border-r h-full">
        <div>
          <div className="text-sm mb-2">Color</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  'w-10 h-10 rounded-full relative border-2',
                  selectedColor === color
                    ? 'border-black'
                    : 'border-transparent'
                )}
                style={{ backgroundColor: color }}
                onClick={() => setSelectedColor(color)}
              >
                {selectedColor === color && (
                  <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                )}
              </button>
            ))}
          </div>
        </div>

        {showSave && (
          <div className="space-x-2 mt-4">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* Users Section */}
      <div className="col-span-2 p-4 bg-gray-50">
        <h1 className="text-lg font-semibold">Users</h1>
        <LocationUsers location={location} />
      </div>
    </div>
  )
}
