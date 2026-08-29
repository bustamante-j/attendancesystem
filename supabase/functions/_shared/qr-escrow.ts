function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function escrowKey() {
  const encoded = Deno.env.get('QR_ESCROW_KEY')
  if (!encoded) throw new Error('Secure QR viewing is not configured.')
  const bytes = base64UrlDecode(encoded)
  if (bytes.length !== 32) throw new Error('Secure QR viewing has an invalid encryption key.')
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptQrCredential(credential: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await escrowKey(),
    new TextEncoder().encode(credential),
  )
  return {
    encryptedToken: base64UrlEncode(new Uint8Array(ciphertext)),
    encryptionIv: base64UrlEncode(iv),
  }
}

export async function decryptQrCredential(encryptedToken: string, encryptionIv: string) {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecode(encryptionIv) },
      await escrowKey(),
      base64UrlDecode(encryptedToken),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error('The stored QR credential could not be decrypted.')
  }
}
