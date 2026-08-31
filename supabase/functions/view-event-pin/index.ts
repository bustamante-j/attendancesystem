import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'
import { decryptEscrowedSecret } from '../_shared/qr-escrow.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { admin } = await requireActor(request, ['super_admin'])
    const body = await request.json()
    const eventId = typeof body.event_id === 'string' ? body.event_id : ''
    if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new Error('A valid event is required.')

    const { data: event, error } = await admin
      .from('events')
      .select('id,encrypted_pin,pin_encryption_iv')
      .eq('id', eventId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw new Error('The event PIN could not be loaded.')
    if (!event) throw new Error('The event was not found.')
    if (!event.encrypted_pin || !event.pin_encryption_iv) {
      throw new Error('This event was created before secure PIN viewing was added. Reset the PIN once to enable viewing.')
    }

    const pin = await decryptEscrowedSecret(event.encrypted_pin, event.pin_encryption_iv)
    if (!/^[0-9]{6}$/.test(pin)) throw new Error('The stored event PIN failed its integrity check.')

    return jsonResponse({ pin })
  } catch (error) {
    return errorResponse(error)
  }
})
