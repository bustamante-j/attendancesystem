import { corsHeaders, errorResponse, jsonResponse, requireActor, requireNonBlank } from '../_shared/http.ts'

function secureSixDigitPin() {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return String(value[0] % 1_000_000).padStart(6, '0')
}

function dateValue(value: unknown, label: string) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`)
  return new Date(value).toISOString()
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin', 'faculty'])
    const body = await request.json()
    const mode = body.attendance_mode
    if (!['check_in_only', 'check_in_out'].includes(mode)) throw new Error('Invalid attendance mode.')
    const departments = Array.isArray(body.department_ids) ? body.department_ids : []
    const years = Array.isArray(body.year_levels) ? body.year_levels.map(Number) : []
    if (!departments.length) throw new Error('Select at least one department.')
    if (years.some((year: number) => !Number.isInteger(year) || year < 1 || year > 4)) {
      throw new Error('Invalid year level.')
    }

    const pin = secureSixDigitPin()
    const params = {
      p_actor_id: actor.id,
      p_name: requireNonBlank(body.name, 'Event name'),
      p_description: typeof body.description === 'string' ? body.description : '',
      p_venue: typeof body.venue === 'string' ? body.venue : '',
      p_start_at: dateValue(body.start_at, 'Start time'),
      p_end_at: dateValue(body.end_at, 'End time'),
      p_check_in_opens_at: dateValue(body.check_in_opens_at, 'Check-in open time'),
      p_late_after: dateValue(body.late_after, 'Late threshold'),
      p_check_in_closes_at: dateValue(body.check_in_closes_at, 'Check-in close time'),
      p_attendance_mode: mode,
      p_check_out_opens_at: mode === 'check_in_out' ? dateValue(body.check_out_opens_at, 'Check-out open time') : null,
      p_check_out_closes_at: mode === 'check_in_out' ? dateValue(body.check_out_closes_at, 'Check-out close time') : null,
      p_department_ids: departments,
      p_year_levels: years,
      p_plaintext_pin: pin,
    }
    const { data: eventId, error } = await admin.rpc('create_event_secure', params)
    if (error) throw new Error('The event could not be created. Check the schedule and audience values.')

    return jsonResponse({
      eventId,
      pin,
      warning: 'This PIN is shown once. Reset it if it is lost.',
    }, 201)
  } catch (error) {
    return errorResponse(error)
  }
})
