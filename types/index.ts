import { RootState as RootStateType } from '@/lib/redux'

export type RootState = RootStateType

export interface Settings {
  id: string
  shipping_company: string
  shipping_address: string
  shipping_contact_number: string
  billing_company: string
  billing_address: string
  billing_contact_number: string
}

export interface User {
  id: string
  user_id: string
  org_id: string
  name: string
  password: string
  email?: string
  type?: string
  is_active: boolean
  created_at?: string
}

export interface AddUserFormValues {
  name: string
  email: string
  type: string
  is_active: boolean
}

export interface Resident {
  id: number
  fullname: string
  location_id: number
  type: string
  location?: Location
  resident_remarks?: ResidentRemarks[]
}

export interface Location {
  id: number
  name: string
  address: string
  description?: string
  org_id?: string
  color: string
  purok?: string[]
  sps?: string[]
}
export interface LocationUser {
  id: number
  user_id: number
  location_id: number
  org_id: string
  is_editor: boolean
  is_importer: boolean
  is_disabled: boolean
  user: User
}

export interface Voter {
  id: number
  location_id: number
  fullname: string
  address: string
  precinct: string
  barangay: string
  birthday: string
  category: string
  voter_remarks: VoterRemarks[]
}

export interface Member {
  id: number
  fullname: string
  lastname: string
  firstname: string
  middlename: string
  barangay: string
  birthday: string
  municipality: string
  member_remarks: MemberRemarks[]
}

export interface ResidentRemarks {
  id: number
  created_at: string
  resident_id: number
  content: string
  author: string
}
export interface VoterRemarks {
  id: number
  created_at: string
  voter_id: number
  voter: Voter
  author: string
  status: 'Pending Approval' | 'Approved'
  user_id: string
  remarks: string
}
export interface MemberRemarks {
  id: number
  created_at: string
  voter_id: number
  voter: Voter
  member: Member
  author: string
  status: 'Pending Approval' | 'Approved'
  user_id: string
  remarks: string
  details: {
    id: number
    fullname: string
    firstname: string
    middlename: string
    lastname: string
    barangay: string
    municipality: string
    birthday: string
  }
}

export interface HouseholdRemarks {
  id: number
  created_at: string
  household_id: number
  content: string
  author: string
}

// Household record (asenso.households)
export interface Household {
  id: number
  name: string
  purok: string
  sp?: string
  sitio: string
  barangay?: string | null
  address?: string | null
  location_id?: number | null
  org_id?: number | null
  created_at?: string

  // Relations
  families?: Family[]
}

export interface VoterLite {
  id: number
  voter_id: number
  fullname: string
  is_registered: boolean
  is_asenso: boolean | null
  relation: string
}

// Family record (asenso.families)
export interface Family {
  id: number
  household_id: number
  husband_id?: number | null
  wife_id?: number | null
  asenso_husband?: boolean | null
  asenso_wife?: boolean | null
  created_at?: string
  wife_name: string
  husband_name: string
  all_nr?: boolean

  // Relations
  husband?: VoterLite | null
  wife?: VoterLite | null
  family_members?: FamilyMember[]
  allowNonRegistered?: boolean
}

// Family member record (asenso.family_members)
export interface FamilyMember {
  id?: number
  family_id?: number
  voter_id?: number | null
  fullname: string
  relation: string
  is_registered: boolean
  asenso?: boolean
  created_at?: string

  // Relations
  voter?: Voter | null
}
