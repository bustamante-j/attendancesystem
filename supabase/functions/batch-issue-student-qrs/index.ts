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
    const studentIds = Array.isArray(body.student_ids) ? body.student_ids : []
    if (studentIds.length < 1 || studentIds.length > 500) throw new Error('Select 1 to 500 students.')
    if (studentIds.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
      throw new Error('One or more student identifiers are invalid.')
    }
    if (new Set(studentIds).size !== studentIds.length) throw new Error('The student selection contains duplicates.')

    const credentials = await Promise.all(studentIds.map(async (studentId: string) => {
      const credential = `ATTENDLY_${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`
      const encrypted = await encryptQrCredential(credential)
      return {
        student_id: studentId,
        credential,
        token_hash: await sha256Hex(credential),
        token_prefix: credential.slice(0, 12),
        encrypted_token: encrypted.encryptedToken,
        encryption_iv: encrypted.encryptionIv,
      }
    }))

    const { error } = await admin.rpc('batch_issue_student_qr_with_escrow_secure', {
      p_actor_id: actor.id,
      p_credentials: credentials.map(({ student_id, token_hash, token_prefix, encrypted_token, encryption_iv }) => ({
        student_id, token_hash, token_prefix, encrypted_token, encryption_iv,
      })),
    })
    if (error) throw new Error('The credential batch could not be issued. No credentials were changed.')

    return jsonResponse({
      credentials: credentials.map(({ student_id, credential }) => ({ studentId: student_id, credential })),
      warning: 'These credentials can be securely viewed again by a Super Admin.',
    })
  } catch (error) {
    return errorResponse(error)
  }
})
