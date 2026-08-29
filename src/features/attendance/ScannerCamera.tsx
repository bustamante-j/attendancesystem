import type { IScannerControls } from '@zxing/browser'
import { Camera, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function ScannerCamera({ enabled, processing, onDecode, onError }: {
  enabled: boolean
  processing: boolean
  onDecode: (credential: string) => void
  onError: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onDecodeRef = useRef(onDecode)
  const onErrorRef = useRef(onError)
  const [starting, setStarting] = useState(false)

  useEffect(() => { onDecodeRef.current = onDecode }, [onDecode])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  useEffect(() => {
    const videoElement = videoRef.current
    if (!enabled || !videoElement) return
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current('Camera scanning is not supported by this browser.')
      return
    }

    let disposed = false
    let controls: IScannerControls | null = null
    setStarting(true)

    void import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      if (disposed) return null
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 700,
      })
      return reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoElement,
        (result) => {
          if (result && !disposed) onDecodeRef.current(result.getText())
        },
      )
    }).then((nextControls) => {
      if (!nextControls) return
      if (disposed) nextControls.stop()
      else controls = nextControls
    }).catch((cause: unknown) => {
      if (disposed) return
      const name = cause instanceof DOMException ? cause.name : ''
      const message = name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
        : name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : name === 'NotReadableError'
            ? 'The camera is already in use by another application.'
          : 'The camera could not be started. Check its permission and try again.'
      onErrorRef.current(message)
    }).finally(() => {
      if (!disposed) setStarting(false)
    })

    return () => {
      disposed = true
      controls?.stop()
    }
  }, [enabled])

  return (
    <div className="relative aspect-[3/4] max-h-[58svh] min-h-80 overflow-hidden rounded-xl bg-slate-950 ring-1 ring-white/10 sm:aspect-video sm:max-h-[68vh]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="QR scanner camera preview" />
      {!enabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.14),transparent_50%)] text-slate-300">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><Camera size={32} /></span>
          <span className="text-sm font-medium">Camera is ready to start</span>
        </div>
      )}
      {enabled && starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-white">
          <LoaderCircle className="animate-spin" size={30} />
          <span className="ml-2 text-sm">Starting camera…</span>
        </div>
      )}
      {enabled && !starting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`relative h-52 w-52 rounded-2xl border-4 shadow-[0_0_0_999px_rgba(2,6,23,0.22)] transition sm:h-56 sm:w-56 ${processing ? 'border-blue-400' : 'border-white/90'}`}>
            {!processing && <span className="scanner-line absolute inset-x-3 top-4 h-0.5 bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.9)]" />}
            <span className="sr-only">Place the QR code inside the frame</span>
          </div>
          <span className="absolute bottom-5 rounded-full bg-slate-950/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">Align the QR code inside the frame</span>
        </div>
      )}
      {processing && (
        <div className="absolute inset-x-0 bottom-0 bg-blue-700/95 px-4 py-3 text-center text-sm font-medium text-white">
          Processing scan…
        </div>
      )}
    </div>
  )
}
