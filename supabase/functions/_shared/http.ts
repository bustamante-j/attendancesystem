import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(error: unknown, fallback = 'Request failed.', status = 400) {
  const message = error instanceof Error ? error.message : fallback
  return jsonResponse({ error: message || fallback }, status)
}

export interface ActorContext {
  user: User
  profile: {
    id: string
    username: string
    full_name: string
    role: 'super_admin' | 'faculty' | 'officer'
    is_enabled: boolean
  }
  admin: SupabaseClient
}

export async function requireActor(
  request: Request,
  allowedRoles: ActorContext['profile']['role'][],
): Promise<ActorContext> {
  const authorization = request.headers.get('Authorization')
  if (!authorization) throw new Error('Authentication is required.')

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Function environment is not configured.')

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) throw new Error('Your session is invalid or expired.')

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('id,username,full_name,role,is_enabled')
    .eq('id', userData.user.id)
    .single()
  if (profileError || !profile || !profile.is_enabled) throw new Error('Your account is disabled or unavailable.')
  if (!allowedRoles.includes(profile.role)) throw new Error('You are not authorized for this action.')

  return {
    user: userData.user,
    profile,
    admin: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  }
}

export function normalizeUsername(value: unknown) {
  if (typeof value !== 'string') throw new Error('Username is required.')
  const username = value.trim().toLowerCase()
  if (!/^[a-z0-9_.]{3,40}$/.test(username)) {
    throw new Error('Username must be 3-40 characters using letters, numbers, underscore, or dot.')
  }
  return username
}

export function usernameToInternalEmail(username: string) {
  return `${username}@auth.attendly.local`
}

export function requireNonBlank(value: unknown, label: string, maximum = 200) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`)
  if (value.trim().length > maximum) throw new Error(`${label} is too long.`)
  return value.trim()
}
