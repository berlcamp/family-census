'use client'

import { supabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export interface BarangayStat {
  barangay: string
  households: number
  families: number
  sps: number
  total_registered: number
  /** Families where nobody is a registered voter ("ALL NR"). */
  total_non_registered: number
  total_ap_membership_true: number
  total_ap_membership_false: number
}

export interface MunicipalityStat {
  address: string
  total_households: number
  total_families: number
  total_all_nr_families: number
  total_no_ap_families: number
  total_with_ap_families: number
  total_households_all_nr: number
}

type State<T> = { data: T[]; loading: boolean; error: string | null }

/**
 * Per-barangay counts for one municipality. Loaded once and shared by the
 * tiles, chart and table (it used to be fetched twice).
 */
export function useBarangayStats(address?: string | null): State<BarangayStat> {
  const [state, setState] = useState<State<BarangayStat>>({
    data: [],
    loading: true,
    error: null
  })

  useEffect(() => {
    if (!address) return
    let cancelled = false
    setState({ data: [], loading: true, error: null })
    supabase
      .rpc('barangay_stats_fast', { address_param: address })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: [], loading: false, error: error.message })
          return
        }
        setState({
          data: (data ?? []).map((d: BarangayStat) => ({
            barangay: d.barangay,
            households: Number(d.households ?? 0),
            families: Number(d.families ?? 0),
            sps: Number(d.sps ?? 0),
            total_registered: Number(d.total_registered ?? 0),
            total_non_registered: Number(d.total_non_registered ?? 0),
            total_ap_membership_true: Number(d.total_ap_membership_true ?? 0),
            total_ap_membership_false: Number(d.total_ap_membership_false ?? 0)
          })),
          loading: false,
          error: null
        })
      })
    return () => {
      cancelled = true
    }
  }, [address])

  return state
}

/** Per-municipality counts (province admins). */
export function useMunicipalityStats(enabled: boolean): State<MunicipalityStat> {
  const [state, setState] = useState<State<MunicipalityStat>>({
    data: [],
    loading: true,
    error: null
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    supabase.rpc('dashboard_counts_fast').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setState({ data: [], loading: false, error: error.message })
        return
      }
      setState({
        data: (data ?? []).map((d: MunicipalityStat) => ({
          address: d.address,
          total_households: Number(d.total_households ?? 0),
          total_families: Number(d.total_families ?? 0),
          total_all_nr_families: Number(d.total_all_nr_families ?? 0),
          total_no_ap_families: Number(d.total_no_ap_families ?? 0),
          total_with_ap_families: Number(d.total_with_ap_families ?? 0),
          total_households_all_nr: Number(d.total_households_all_nr ?? 0)
        })),
        loading: false,
        error: null
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}

export const fmt = (n: number) => new Intl.NumberFormat().format(n)
