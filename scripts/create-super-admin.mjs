import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

function normalizeUsername(value) {
  const username = value.trim().toLowerCase()
  if (!/^[a-z0-9_.]{3,40}$/.test(username)) {
    throw new Error('Username must be 3-40 characters using letters, numbers, underscore, or dot.')
  }
  return username
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.')
}

const terminal = createInterface({ input, output })
try {
  const username = normalizeUsername(argument('username') || process.env.ADMIN_USERNAME || await terminal.question('Username: '))
  const fullName = (argument('full-name') || process.env.ADMIN_FULL_NAME || await terminal.question('Full name: ')).trim()
  const password = argument('password') || process.env.ADMIN_PASSWORD || await terminal.question('Password (12+ characters): ')
  if (!fullName) throw new Error('Full name is required.')
  if (password.length < 12 || password.length > 128) throw new Error('Password must be 12-128 characters.')

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: `${username}@attendance.kcp.local`,
    password,
    email_confirm: true,
    user_metadata: { display_name: fullName },
  })
  if (authError || !created.user) throw new Error(authError?.message || 'Could not create Auth user.')

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    username,
    full_name: fullName,
    role: 'super_admin',
    is_enabled: true,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    throw new Error(`Could not create profile: ${profileError.message}`)
  }

  await admin.from('audit_logs').insert({
    actor_user_id: created.user.id,
    action: 'user_created',
    entity_type: 'user',
    entity_id: created.user.id,
    metadata: { username, role: 'super_admin', bootstrap: true },
  })
  console.log(`Super Admin created for username: ${username}`)
} finally {
  terminal.close()
}
