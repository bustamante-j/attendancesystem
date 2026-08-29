import { corsHeaders, errorResponse, jsonResponse, requireActor } from '../_shared/http.ts'
import { decryptQrCredential } from '../_shared/qr-escrow.ts'

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

    const { data: credential, error } = await admin
      .from('student_qr_credentials')
      .select('id,token_hash,encrypted_token,encryption_iv,issued_at')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .is('revoked_at', null)
      .maybeSingle()
    if (error) throw new Error('The QR credential could not be loaded.')
    if (!credential) throw new Error('This student does not have an active QR credential.')
    if (!credential.encrypted_token || !credential.encryption_iv) {
      throw new Error('This QR was issued before secure viewing was added. Regenerate it once to enable viewing.')
    }

    const plaintext = await decryptQrCredential(credential.encrypted_token, credential.encryption_iv)
    if (await sha256Hex(plaintext) !== credential.token_hash) {
      throw new Error('The stored QR credential failed its integrity check.')
    }

    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_user_id: actor.id,
      action: 'qr_viewed',
      entity_type: 'student_qr_credential',
      entity_id: credential.id,
      metadata: { student_id: studentId },
    })
    if (auditError) throw new Error('The QR view could not be audited.')

    return jsonResponse({ credential: plaintext, issuedAt: credential.issued_at })
  } catch (error) {
    return errorResponse(error)
  }
})
