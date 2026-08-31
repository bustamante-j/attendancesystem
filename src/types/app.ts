export type UserRole = 'super_admin' | 'admin' | 'faculty' | 'officer'
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
  deleted_at: string | null
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
  is_historical: boolean
  attendance_finalized_at: string | null
  attendance_finalized_by: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface EventRosterStudentRow {
  attendance_id: string | null
  student_id: string
  student_number: string
  full_name: string
  sex: Sex
  year_level: 1 | 2 | 3 | 4
  department_id: string
  department_name: string
  department_code: string
  is_expected: boolean
  attendance_status: AttendanceReportStatus
  check_in_at: string | null
  check_in_method: 'qr' | 'manual' | null
  check_out_at: string | null
  check_out_method: 'qr' | 'manual' | null
  remarks: string | null
}

export interface EventGuestAttendance {
  id: string
  event_id: string
  full_name: string
  reference_number: string | null
  affiliation: string | null
  attendance_status: Exclude<AttendanceReportStatus, 'absent'>
  recorded_at: string
  remarks: string | null
  recorded_by: string
  created_at: string
  updated_at: string
}

export interface AttendanceResult {
  code: string
  message: string
  student?: {
    id: string
    studentNumber: string
    fullName: string
  }
  attendance?: {
    id?: string
    checkInAt?: string
    checkInStatus?: 'present' | 'late'
    checkOutAt?: string | null
  }
}

export interface AttendanceSummary {
  expected: number
  checkedIn: number
  remaining: number
  present: number
  late: number
  checkedOut: number
}

export interface EventStudentSearchResult {
  student_id: string
  student_number: string
  full_name: string
  year_level: 1 | 2 | 3 | 4
  department_code: string
  check_in_at: string | null
  check_in_status: 'present' | 'late' | null
  check_out_at: string | null
}

export type AttendanceReportStatus = 'present' | 'late' | 'absent'

export interface AttendanceReportRow {
  student_id: string
  student_number: string
  full_name: string
  sex: Sex
  year_level: 1 | 2 | 3 | 4
  department_id: string
  department_name: string
  department_code: string
  is_expected: boolean
  attendance_status: AttendanceReportStatus
  check_in_at: string | null
  check_in_method: 'qr' | 'manual' | null
  check_out_at: string | null
  check_out_method: 'qr' | 'manual' | null
}

export interface StudentAttendanceHistoryRow {
  event_id: string
  event_name: string
  event_start_at: string
  event_status: EventStatus
  attendance_status: AttendanceReportStatus
  check_in_at: string | null
  check_in_method: 'qr' | 'manual' | null
  check_out_at: string | null
  check_out_method: 'qr' | 'manual' | null
}
