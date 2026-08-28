export async function createQrDataUrl(credential: string, width = 512) {
  const QRCode = await import('qrcode')
  return QRCode.toDataURL(credential, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width,
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

export interface QrCardDetails {
  fullName: string
  studentNumber: string
  sex: string
  departmentCode?: string | null
  yearLevel: number
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The QR image could not be composed.'))
    image.src = source
  })
}

function drawCenteredText(context: CanvasRenderingContext2D, text: string, y: number, maxWidth: number, startingSize: number, weight = 700) {
  let size = startingSize
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`
    size -= 1
  } while (context.measureText(text).width > maxWidth && size > 22)
  context.fillText(text, 450, y, maxWidth)
}

export async function createQrCardDataUrl(credential: string, details: QrCardDetails) {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 1200
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot create QR card images.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#0f172a'
  context.lineWidth = 8
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#0f172a'
  context.font = '700 58px Arial, sans-serif'
  context.fillText('Attendly', 450, 82)
  context.fillStyle = '#64748b'
  context.font = '600 22px Arial, sans-serif'
  context.fillText('SECURE ATTENDANCE CREDENTIAL', 450, 130)

  const qrImage = await loadImage(await createQrDataUrl(credential, 660))
  context.drawImage(qrImage, 120, 170, 660, 660)

  context.fillStyle = '#0f172a'
  drawCenteredText(context, details.fullName.trim(), 884, 790, 46)

  context.fillStyle = '#334155'
  context.font = '600 31px Arial, sans-serif'
  context.fillText(`Student ID: ${details.studentNumber.trim()}`, 450, 946, 790)
  context.fillText(`Sex: ${details.sex}`, 450, 995, 790)
  context.font = '500 28px Arial, sans-serif'
  context.fillText(`${details.departmentCode || 'Department not set'}  •  Year ${details.yearLevel}`, 450, 1043, 790)

  context.strokeStyle = '#cbd5e1'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(85, 1084)
  context.lineTo(815, 1084)
  context.stroke()
  context.fillStyle = '#64748b'
  context.font = '400 20px Arial, sans-serif'
  context.fillText('Present this credential at authorized events. Do not share it.', 450, 1128, 790)

  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName.replace(/[^a-z0-9_.-]+/gi, '_')
  anchor.click()
}
