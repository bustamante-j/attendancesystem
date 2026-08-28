import { supabase } from '../lib/supabase'
import type { AttendanceResult } from '../types/app'

export async function processTestScan(eventId: string, rawCredential: string, direction: 'check_in' | 'check_out') {
  const { data, error } = await supabase.rpc('process_attendance_scan', {
    p_event_id: eventId,
    p_raw_credential: rawCredential,
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
