import { supabase } from '../lib/supabase'
import type { AttendanceMode, EventRecord, EventStatus } from '../types/app'
import { invokeFunction } from './functions'

const EVENT_COLUMNS = 'id,name,description,venue,start_at,end_at,check_in_opens_at,late_after,check_in_closes_at,attendance_mode,check_out_opens_at,check_out_closes_at,status,created_by,created_at,updated_at,deleted_at'

export interface EventInput {
  name: string
  description: string
  venue: string
  start_at: string
  end_at: string
  check_in_opens_at: string
  late_after: string
  check_in_closes_at: string
  attendance_mode: AttendanceMode
  check_out_opens_at: string | null
  check_out_closes_at: string | null
  department_ids: string[]
  year_levels: number[]
}

export async function listEvents() {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .is('deleted_at', null)
    .order('start_at', { ascending: false })
  if (error) throw error
  return data as EventRecord[]
}

export async function createEvent(input: EventInput) {
  return invokeFunction<{ eventId: string; pin: string; warning: string }>('create-event', input as unknown as Record<string, unknown>)
}

export async function resetEventPin(eventId: string) {
  return invokeFunction<{ pin: string; warning: string }>('reset-event-pin', { event_id: eventId })
}

export async function getEventAudience(eventId: string) {
  const [departments, years] = await Promise.all([
    supabase.from('event_departments').select('department_id').eq('event_id', eventId),
    supabase.from('event_year_levels').select('year_level').eq('event_id', eventId),
  ])
  if (departments.error) throw departments.error
  if (years.error) throw years.error
  return {
    departmentIds: departments.data.map((row) => row.department_id as string),
    yearLevels: years.data.map((row) => row.year_level as number),
  }
}

export async function updateEvent(eventId: string, input: EventInput, status: EventStatus) {
  const { error } = await supabase.rpc('update_event_details', {
    p_event_id: eventId,
    p_name: input.name,
    p_description: input.description,
    p_venue: input.venue,
    p_start_at: input.start_at,
    p_end_at: input.end_at,
    p_check_in_opens_at: input.check_in_opens_at,
    p_late_after: input.late_after,
    p_check_in_closes_at: input.check_in_closes_at,
    p_attendance_mode: input.attendance_mode,
    p_check_out_opens_at: input.check_out_opens_at,
    p_check_out_closes_at: input.check_out_closes_at,
    p_status: status,
    p_department_ids: input.department_ids,
    p_year_levels: input.year_levels,
  })
  if (error) throw error
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  const { error } = await supabase.rpc('set_event_status_secure', {
    p_event_id: eventId,
    p_status: status,
  })
  if (error) throw error
}

export async function softDeleteEvent(eventId: string) {
  const { error } = await supabase.rpc('soft_delete_event', { p_event_id: eventId })
  if (error) throw error
}

export async function expectedStudentCount(eventId: string) {
  const { data, error } = await supabase.rpc('get_event_expected_count', { p_event_id: eventId })
  if (error) throw error
  return Number(data)
}

export interface EventAssignment {
  event_id: string
  user_id: string
  assigned_by: string
  created_at: string
  profiles?: { id: string; full_name: string; username: string; role: string } | null
}

export async function listEventAssignments(eventId: string) {
  const { data, error } = await supabase
    .from('event_assignments')
    .select('event_id,user_id,assigned_by,created_at,profiles!event_assignments_user_id_fkey(id,full_name,username,role)')
    .eq('event_id', eventId)
  if (error) throw error
  return data as unknown as EventAssignment[]
}

export async function assignUser(eventId: string, userId: string, assignedBy: string) {
  const { error } = await supabase.from('event_assignments').insert({
    event_id: eventId,
    user_id: userId,
    assigned_by: assignedBy,
  })
  if (error) throw error
}

export async function removeAssignment(eventId: string, userId: string) {
  const { error } = await supabase
    .from('event_assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId)
  if (error) throw error
}
