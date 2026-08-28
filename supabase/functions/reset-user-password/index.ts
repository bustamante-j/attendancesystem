import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin'])
    const body = await request.json()
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    const password = typeof body.new_password === 'string' ? body.new_password : ''
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('A valid target user is required.')
    if (password.length < 12 || password.length > 128) throw new Error('Password must be 12-128 characters.')

    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error('The password could not be reset.')
    await admin.from('audit_logs').insert({
      actor_user_id: actor.id,
      action: 'password_reset',
      entity_type: 'user',
      entity_id: userId,
    })
    return jsonResponse({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
})
