import { corsHeaders, errorResponse, jsonResponse, normalizeUsername, requireActor, requireNonBlank, usernameToInternalEmail } from '../_shared/http.ts'

const roles = ['super_admin', 'admin', 'faculty', 'officer'] as const

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin'])
    const body = await request.json()
    const username = normalizeUsername(body.username)
    const fullName = requireNonBlank(body.full_name, 'Full name')
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role as typeof roles[number]
    if (password.length < 12 || password.length > 128) throw new Error('Password must be 12-128 characters.')
    if (!roles.includes(role)) throw new Error('Invalid role.')

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: usernameToInternalEmail(username),
      password,
      email_confirm: true,
      user_metadata: { display_name: fullName },
    })
    if (createError || !created.user) {
      if (createError?.message.toLowerCase().includes('already')) throw new Error('That username is already in use.')
      throw new Error('The authentication account could not be created.')
    }

    const profile = {
      id: created.user.id,
      username,
      full_name: fullName,
      role,
      is_enabled: true,
    }
    const { error: profileError } = await admin.from('profiles').insert(profile)
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      if (profileError.code === '23505') throw new Error('That username is already in use.')
      throw new Error('The user profile could not be created.')
    }

    await admin.from('audit_logs').insert({
      actor_user_id: actor.id,
      action: 'user_created',
      entity_type: 'user',
      entity_id: created.user.id,
      metadata: { username, role },
    })

    return jsonResponse({ user: profile }, 201)
  } catch (error) {
    return errorResponse(error)
  }
})
