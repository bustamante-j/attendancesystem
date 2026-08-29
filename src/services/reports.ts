import { supabase } from '../lib/supabase'
import type { AttendanceReportRow, StudentAttendanceHistoryRow } from '../types/app'

const QUERY_PAGE_SIZE = 500

export async function getEventAttendanceReport(eventId: string) {
  const rows: AttendanceReportRow[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('get_event_attendance_report', { p_event_id: eventId })
      .range(from, from + QUERY_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data as AttendanceReportRow[]))
    if (data.length < QUERY_PAGE_SIZE) return rows
  }
}

export async function getStudentAttendanceHistory(studentId: string) {
  const { data, error } = await supabase.rpc('get_student_attendance_history', { p_student_id: studentId })
  if (error) throw error
  return data as StudentAttendanceHistoryRow[]
}

export async function correctAttendance(input: {
  eventId: string
  studentId: string
  checkInAt: string
  checkInStatus: 'present' | 'late'
  checkOutAt: string | null
}) {
  const { error } = await supabase.rpc('admin_correct_attendance', {
    p_event_id: input.eventId,
    p_student_id: input.studentId,
    p_check_in_at: input.checkInAt,
    p_check_in_status: input.checkInStatus,
    p_check_out_at: input.checkOutAt,
  })
  if (error) throw error
}

export async function removeAttendance(eventId: string, studentId: string) {
  const { error } = await supabase.rpc('admin_remove_attendance', {
    p_event_id: eventId,
    p_student_id: studentId,
  })
  if (error) throw error
}
