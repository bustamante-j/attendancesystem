import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'

function secureSixDigitPin() {
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return String(value[0] % 1_000_000).padStart(6, '0')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin', 'faculty'])
    const body = await request.json()
    const eventId = typeof body.event_id === 'string' ? body.event_id : ''
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new Error('A valid event is required.')

    const pin = secureSixDigitPin()
    const { error } = await admin.rpc('reset_event_pin_secure', {
      p_actor_id: actor.id,
      p_event_id: eventId,
      p_plaintext_pin: pin,
    })
    if (error) throw new Error('The event PIN could not be reset.')
    return jsonResponse({ pin, warning: 'This PIN is shown once.' })
  } catch (error) {
    return errorResponse(error)
  }
})
