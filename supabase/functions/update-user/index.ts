import { corsHeaders, errorResponse, jsonResponse, normalizeUsername, requireActor, requireNonBlank, usernameToInternalEmail } from '../_shared/http.ts'

const roles = ['super_admin', 'admin', 'faculty', 'officer'] as const

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin'])
    const body = await request.json()
    const userId = typeof body.user_id === 'string' ? body.user_id : ''
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('A valid user is required.')
    const username = normalizeUsername(body.username)
    const fullName = requireNonBlank(body.full_name, 'Full name')
    const role = body.role as typeof roles[number]
    if (!roles.includes(role)) throw new Error('Invalid role.')

    const { data: oldProfile, error: profileLookupError } = await admin
      .from('profiles')
      .select('username,full_name,role')
      .eq('id', userId)
      .single()
    if (profileLookupError || !oldProfile) throw new Error('User not found.')
    if (oldProfile.role === 'super_admin' && role !== 'super_admin') throw new Error('The Super Admin role is permanently protected.')
    if (oldProfile.role !== 'super_admin' && role === 'super_admin') throw new Error('A second Super Admin cannot be created.')

    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email: usernameToInternalEmail(username),
      email_confirm: true,
      user_metadata: { display_name: fullName },
    })
    if (authError) {
      if (authError.message.toLowerCase().includes('already')) throw new Error('That username is already in use.')
      throw new Error('The authentication account could not be updated.')
    }

    const { error: updateError } = await admin.rpc('update_user_profile_secure', {
      p_actor_id: actor.id,
      p_user_id: userId,
      p_username: username,
      p_full_name: fullName,
      p_role: role,
    })
    if (updateError) {
      await admin.auth.admin.updateUserById(userId, {
        email: usernameToInternalEmail(oldProfile.username),
        email_confirm: true,
        user_metadata: { display_name: oldProfile.full_name },
      })
      if (updateError.code === '23505') throw new Error('That username is already in use.')
      throw new Error('The user profile could not be updated.')
    }

    return jsonResponse({ user: { id: userId, username, full_name: fullName, role } })
  } catch (error) {
    return errorResponse(error)
  }
})
