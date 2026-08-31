import { supabase } from '../lib/supabase'
import type { AttendanceReportStatus, EventGuestAttendance, EventRosterStudentRow } from '../types/app'

const QUERY_PAGE_SIZE = 500

export async function getEventAttendanceRoster(eventId: string) {
  const rows: EventRosterStudentRow[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('get_event_attendance_roster', { p_event_id: eventId })
      .range(from, from + QUERY_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data as EventRosterStudentRow[]))
    if (data.length < QUERY_PAGE_SIZE) return rows
  }
}

export async function listEventGuestAttendance(eventId: string) {
  const rows: EventGuestAttendance[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('event_guest_attendance')
      .select('id,event_id,full_name,reference_number,affiliation,attendance_status,recorded_at,remarks,recorded_by,created_at,updated_at')
      .eq('event_id', eventId)
      .order('full_name')
      .order('id')
      .range(from, from + QUERY_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data as EventGuestAttendance[]))
    if (data.length < QUERY_PAGE_SIZE) return rows
  }
}

export async function setEventRosterAttendance(input: {
  eventId: string
  studentIds: string[]
  status: AttendanceReportStatus
  recordedAt: string
  checkOutAt?: string | null
  preserveCheckOut?: boolean
  remarks?: string | null
  preserveRemarks?: boolean
}) {
  const { data, error } = await supabase.rpc('set_event_roster_attendance', {
    p_event_id: input.eventId,
    p_student_ids: input.studentIds,
    p_status: input.status,
    p_recorded_at: input.recordedAt,
    p_check_out_at: input.checkOutAt ?? null,
    p_preserve_check_out: input.preserveCheckOut ?? true,
    p_remarks: input.remarks ?? null,
    p_preserve_remarks: input.preserveRemarks ?? true,
  })
  if (error) throw error
  return Number(data)
}

export interface GuestAttendanceInput {
  fullName: string
  referenceNumber: string
  affiliation: string
  status: 'present' | 'late'
  recordedAt: string
  remarks: string
}

export async function addEventGuestAttendance(eventId: string, input: GuestAttendanceInput) {
  const { data, error } = await supabase.rpc('add_event_guest_attendee', {
    p_event_id: eventId,
    p_full_name: input.fullName,
    p_reference_number: input.referenceNumber,
    p_affiliation: input.affiliation,
    p_status: input.status,
    p_recorded_at: input.recordedAt,
    p_remarks: input.remarks,
  })
  if (error) throw error
  return data as EventGuestAttendance
}

export async function updateEventGuestAttendance(guestId: string, input: GuestAttendanceInput) {
  const { data, error } = await supabase.rpc('update_event_guest_attendee', {
    p_guest_id: guestId,
    p_full_name: input.fullName,
    p_reference_number: input.referenceNumber,
    p_affiliation: input.affiliation,
    p_status: input.status,
    p_recorded_at: input.recordedAt,
    p_remarks: input.remarks,
  })
  if (error) throw error
  return data as EventGuestAttendance
}

export async function removeEventGuestAttendance(guestId: string) {
  const { error } = await supabase.rpc('remove_event_guest_attendee', { p_guest_id: guestId })
  if (error) throw error
}

export async function undoLastEventRosterChange(eventId: string) {
  const { data, error } = await supabase.rpc('undo_last_event_roster_change', { p_event_id: eventId })
  if (error) throw error
  return data as { undone: boolean; message: string }
}

export async function setEventAttendanceFinalized(eventId: string, finalized: boolean) {
  const { error } = await supabase.rpc('set_event_attendance_finalized', {
    p_event_id: eventId,
    p_finalized: finalized,
  })
  if (error) throw error
}

export function subscribeToEventRoster(eventId: string, onChange: () => void) {
  const channel = supabase
    .channel(`event-roster:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance', filter: `event_id=eq.${eventId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_guest_attendance', filter: `event_id=eq.${eventId}` },
      onChange,
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
