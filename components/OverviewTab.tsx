'use client'

import { DownloadHouseholdExcel } from '@/lib/functions/DownloadHouseholdExcel'
import { useAppDispatch, useAppSelector } from '@/lib/redux/hook'
import { setLocation } from '@/lib/redux/locationSlice'
import { updateList } from '@/lib/redux/locationsSlice'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import LocationUsers from './LocationUsers'
import OverviewBarGraph from './OverviewBarGraph'
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
  const [purokText, setPurokText] = useState(
    Array.isArray(location?.purok) ? location.purok.join('\n') : ''
  )
  const [spsText, setSpsText] = useState(
    Array.isArray(location?.sps) ? location.sps.join('\n') : ''
  )
  const [loading, setLoading] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [householdCount, setHouseholdCount] = useState<number>(0)
  const [loadingHouseholds, setLoadingHouseholds] = useState(false)

  const dispatch = useAppDispatch()

  // Fetch total households for current location
  useEffect(() => {
    if (!location?.id) return

    const fetchHouseholdCount = async () => {
      setLoadingHouseholds(true)
      const { count, error } = await supabase
        .from('households')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', location.id)

      setLoadingHouseholds(false)

      if (error) {
        console.error('Error fetching household count:', error)
        setHouseholdCount(0)
      } else {
        setHouseholdCount(count || 0)
      }
    }

    fetchHouseholdCount()
  }, [location?.id])

  // const isDisabled =(householdCount > 200 || loadingHouseholds) && location?.address !== 'TUDELA'
  console.log(householdCount, loadingHouseholds)
  const isDisabled = false

  const handleSave = async () => {
    if (!location) return
    if (loading) return

    setLoading(true)

    const purokArray = purokText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const spsArray = spsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const { data, error } = await supabase
      .from('locations')
      .update({
        color: selectedColor,
        sps: spsArray,
        purok: purokArray
      })
      .eq('id', location.id)
      .select()
      .single()

    setLoading(false)

    if (error) {
      toast.error(error.message)
    } else {
      dispatch(updateList(data))
      dispatch(setLocation(data))
      toast.success('Successfully saved')
    }
  }

  // Update state if selected location changes
  useEffect(() => {
    setSelectedColor(location?.color || 'gray')
    setPurokText(
      Array.isArray(location?.purok) ? location.purok.join('\n') : ''
    )
    setSpsText(Array.isArray(location?.sps) ? location.sps.join('\n') : '')
  }, [location])

  // Detect unsaved changes
  useEffect(() => {
    const hasChanges =
      selectedColor !== (location?.color || 'gray') ||
      purokText !==
        (Array.isArray(location?.purok) ? location.purok.join('\n') : '') ||
      spsText !== (Array.isArray(location?.sps) ? location.sps.join('\n') : '')

    setShowSave(hasChanges)
  }, [selectedColor, spsText, purokText, location])

  return (
    <div className="lg:grid grid-cols-3 min-h-screen">
      <div className="p-4 flex flex-col gap-4 lg:border-r h-full">
        {/* Warning if editing is disabled */}
        {/* {isDisabled && (
          <div className="bg-red-100 text-red-800 p-2 rounded text-sm mb-2">
            Editing purok is disabled as more than 20 households already added
          </div>
        )} */}
        {/* {!isDisabled && (
          <div className="bg-green-100 text-green-800 p-2 rounded text-sm mb-2">
            Editing purok will be disabled once households exceeds 20
          </div>
        )} */}

        {/* Color */}
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
                disabled={isDisabled}
              >
                {selectedColor === color && (
                  <Check className="w-5 h-5 text-white absolute inset-0 m-auto" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Purok Textarea */}
        <div>
          <div className="text-sm mb-2">Puroks (one per line)</div>
          <textarea
            value={purokText}
            onChange={(e) => setPurokText(e.target.value)}
            rows={6}
            className="w-full border rounded p-2 text-sm"
            placeholder="Enter one purok per line..."
            disabled={isDisabled}
          />
        </div>

        {/* SPS Textarea */}
        {location?.address !== 'OZAMIZ CITY' && (
          <div>
            <div className="text-sm mb-2">Service Providers (one per line)</div>
            <textarea
              value={spsText}
              onChange={(e) => setSpsText(e.target.value)}
              rows={6}
              className="w-full border rounded p-2 text-sm"
              placeholder="Enter one service provider per line..."
              disabled={isDisabled}
            />
          </div>
        )}

        {showSave && (
          <div className="space-x-2 mt-4">
            <Button onClick={handleSave} disabled={isDisabled || loading}>
              {loading ? 'Saving...' : isDisabled ? 'Editing Disabled' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* Users Section */}
      <div className="col-span-2">
        <div className="hidden p-4 w-full">
          {location?.id && (
            <Button
              variant="blue"
              size="sm"
              className="ml-auto"
              onClick={() => DownloadHouseholdExcel(location?.id)}
            >
              Download Households Data to Excel
            </Button>
          )}
        </div>
        <div className="border-t lg:border-t-0">
          <OverviewBarGraph locationId={location?.id} />
        </div>
        <div className="p-4 border-t">
          <h1 className="text-lg font-semibold">Users</h1>
          <LocationUsers location={location} />
        </div>
      </div>
    </div>
  )
}
