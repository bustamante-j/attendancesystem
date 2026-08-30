import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin', 'admin'])
    const body = await request.json()
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    if (!userIdPattern.test(userId)) throw new Error('A valid user is required.')

    const deletedUsername = `deleted_${userId.replaceAll('-', '').slice(0, 12)}_${Date.now().toString(36)}`
    const { error: archiveError } = await admin.rpc('archive_user_secure', {
      p_actor_id: actor.id,
      p_user_id: userId,
      p_deleted_username: deletedUsername,
    })
    if (archiveError) throw new Error(archiveError.message)

    const { error: authError } = await admin.auth.admin.deleteUser(userId, true)
    if (authError) {
      await admin.from('audit_logs').insert({
        actor_user_id: actor.id,
        action: 'user_auth_cleanup_failed',
        entity_type: 'user',
        entity_id: userId,
        metadata: { message: authError.message },
      })
      return jsonResponse({ success: true, warning: 'The account was removed from Attendly, but authentication cleanup needs review.' })
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return errorResponse(error)
  }
})
