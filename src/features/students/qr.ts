export async function createQrDataUrl(credential: string, width = 512) {
  const QRCode = await import('qrcode')
  return QRCode.toDataURL(credential, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName.replace(/[^a-z0-9_.-]+/gi, '_')
  anchor.click()
}
