import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'
import { encryptQrCredential } from '../_shared/qr-escrow.ts'

function base64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const { profile: actor, admin } = await requireActor(request, ['super_admin'])
    const body = await request.json()
    const studentId = typeof body.student_id === 'string' ? body.student_id : ''
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new Error('A valid student is required.')

    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const credential = `ATTENDLY_${base64Url(randomBytes)}`
    const tokenHash = await sha256Hex(credential)
    const encrypted = await encryptQrCredential(credential)
    const { data: credentialId, error } = await admin.rpc('issue_student_qr_with_escrow_secure', {
      p_actor_id: actor.id,
      p_student_id: studentId,
      p_token_hash: tokenHash,
      p_token_prefix: credential.slice(0, 12),
      p_encrypted_token: encrypted.encryptedToken,
      p_encryption_iv: encrypted.encryptionIv,
    })
    if (error) throw new Error(error.code === 'P0002' ? 'Student not found.' : 'The QR credential could not be issued.')

    return jsonResponse({
      credentialId,
      credential,
      warning: 'This credential can be securely viewed again by a Super Admin.',
    })
  } catch (error) {
    return errorResponse(error)
  }
})
