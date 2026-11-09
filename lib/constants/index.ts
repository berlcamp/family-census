export const PER_PAGE = 20

export const disabledAddresses = [
  // 'SAPANG DALAGA',
  // 'LOPEZ JAENA',
  // 'BONIFACIO',
  'ALORAN',
  'CALAMBA',
  'PLARIDEL',
  'JIMENEZ',
  // 'CLARIN',
  'DON VICTORIANO CHIONGBIAN',
  // 'PANAON',
  // 'TUDELA',
  // 'BALIANGAO',
  // 'SINACABAN',
  // 'CITY OF OROQUIETA',
  'OZAMIZ CITY',
  'CONCEPCION'
  // 'CITY OF TANGUB'
]

export const district1 = [
  'SAPANG DALAGA',
  'LOPEZ JAENA',
  'ALORAN',
  'CALAMBA',
  'PLARIDEL',
  'JIMENEZ',
  'PANAON',
  'BALIANGAO',
  'CITY OF OROQUIETA',
  'CONCEPCION'
]
export const district2 = [
  'BONIFACIO',
  'CLARIN',
  'DON VICTORIANO CHIONGBIAN',
  'TUDELA',
  'SINACABAN',
  'OZAMIZ CITY',
  'CITY OF TANGUB'
]

/** Accounts that can manage every user of every type and municipality. */
export const OWNER_EMAILS = ['berlcamp@gmail.com']

export const isOwner = (email?: string | null) =>
  !!email && OWNER_EMAILS.includes(email.trim().toLowerCase())

export const MUNICIPALITIES = [
  'ALORAN',
  'BALIANGAO',
  'BONIFACIO',
  'CALAMBA',
  'CITY OF OROQUIETA',
  'CITY OF TANGUB',
  'CLARIN',
  'CONCEPCION',
  'DON VICTORIANO CHIONGBIAN',
  'JIMENEZ',
  'LOPEZ JAENA',
  'OZAMIZ CITY',
  'PANAON',
  'PLARIDEL',
  'SAPANG DALAGA',
  'SINACABAN',
  'TUDELA'
]

export const USER_TYPES = [
  {
    value: 'viewer',
    label: 'Viewer',
    help: 'Search only, limited to their municipality.'
  },
  {
    value: 'user',
    label: 'User',
    help: 'Encoder. Sees only the barangays assigned to them on each location page.'
  },
  {
    value: 'super admin',
    label: 'Super Admin',
    help: 'Manages every barangay of their municipality.'
  },
  {
    value: 'province admin',
    label: 'Province Admin',
    help: 'Can switch between municipalities.'
  }
] as const
