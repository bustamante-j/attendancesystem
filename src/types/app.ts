export type UserRole = 'super_admin' | 'faculty' | 'officer'
export type Sex = 'Male' | 'Female'
export type AttendanceMode = 'check_in_only' | 'check_in_out'
export type EventStatus = 'draft' | 'open' | 'closed'

export interface Profile {
  id: string
  username: string
  full_name: string
  role: UserRole
  is_enabled: boolean
  session_revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface Department {
  id: string
  name: string
  code: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Student {
  id: string
  student_number: string
  full_name: string
  year_level: 1 | 2 | 3 | 4
  sex: Sex
  department_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  departments?: Pick<Department, 'id' | 'name' | 'code'> | null
}

export interface EventRecord {
  id: string
  name: string
  description: string | null
  venue: string | null
  start_at: string
  end_at: string
  check_in_opens_at: string
  late_after: string
  check_in_closes_at: string
  attendance_mode: AttendanceMode
  check_out_opens_at: string | null
  check_out_closes_at: string | null
  status: EventStatus
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface AttendanceResult {
  code: string
  message: string
  student?: {
    id: string
    studentNumber: string
    fullName: string
  }
  attendance?: Record<string, unknown>
}
