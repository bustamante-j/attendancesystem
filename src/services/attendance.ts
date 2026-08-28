import { supabase } from '../lib/supabase'
import type { AttendanceResult, AttendanceSummary, EventStudentSearchResult } from '../types/app'

export type AttendanceDirection = 'check_in' | 'check_out'

export async function processAttendanceScan(eventId: string, rawCredential: string, direction: AttendanceDirection) {
  const { data, error } = await supabase.rpc('process_attendance_scan', {
    p_event_id: eventId,
    p_raw_credential: rawCredential,
    p_direction: direction,
  })
  if (error) throw error
  return data as AttendanceResult
}

export const processTestScan = processAttendanceScan

export async function processManualAttendance(eventId: string, studentId: string, direction: AttendanceDirection) {
  const { data, error } = await supabase.rpc('process_manual_attendance', {
    p_event_id: eventId,
    p_student_id: studentId,
    p_direction: direction,
  })
  if (error) throw error
  return data as AttendanceResult
}

export async function verifyEventPin(eventId: string, pin: string) {
  const { data, error } = await supabase.rpc('verify_event_pin', { p_event_id: eventId, p_pin: pin })
  if (error) throw error
  return data as { code: string; message: string; expiresAt?: string }
}

export async function hasEventAccess(eventId: string, userId: string, isSuperAdmin: boolean) {
  if (isSuperAdmin) return true
  const { data, error } = await supabase
    .from('event_access_grants')
    .select('expires_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function getAttendanceSummary(eventId: string) {
  const { data, error } = await supabase.rpc('get_event_attendance_summary', { p_event_id: eventId })
  if (error) throw error
  return data as AttendanceSummary
}

export async function searchEventStudents(eventId: string, query: string, limit = 20) {
  const { data, error } = await supabase.rpc('search_event_students', {
    p_event_id: eventId,
    p_query: query,
    p_limit: limit,
  })
  if (error) throw error
  return data as EventStudentSearchResult[]
}

export function subscribeToEventAttendance(eventId: string, onChange: () => void) {
  const channel = supabase
    .channel(`attendance:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${eventId}` },
      onChange,
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export function subscribeToAttendance(onChange: () => void) {
  const channel = supabase
    .channel('attendance:dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
