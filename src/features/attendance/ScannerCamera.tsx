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
    // The viewport stays dark in both themes: it frames a live camera feed, and
    // a light chrome around video only reduces contrast on the QR itself.
    <div className="relative aspect-[3/4] max-h-[58svh] min-h-80 overflow-hidden rounded-xl bg-[#0b0d11] sm:aspect-video sm:max-h-[68vh]">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="QR scanner camera preview" />
      {!enabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><Camera size={26} strokeWidth={1.75} /></span>
          <span className="text-base">Camera is ready to start</span>
        </div>
      )}
      {enabled && starting && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-white">
          <LoaderCircle className="animate-spin" size={22} />
          <span className="text-base">Starting camera…</span>
        </div>
      )}
      {enabled && !starting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`relative h-52 w-52 rounded-2xl border-2 shadow-[0_0_0_999px_rgba(0,0,0,0.35)] transition-colors sm:h-56 sm:w-56 ${processing ? 'border-accent' : 'border-white/90'}`}>
            {!processing && <span className="scanner-line absolute inset-x-3 top-4 h-px bg-accent shadow-[0_0_12px_rgb(var(--accent))]" />}
            <span className="sr-only">Place the QR code inside the frame</span>
          </div>
          <span className="absolute bottom-4 rounded-full bg-black/60 px-3 py-1 text-meta text-white backdrop-blur">
            Align the QR code inside the frame
          </span>
        </div>
      )}
      {processing && (
        <div className="absolute inset-x-0 bottom-0 bg-accent px-4 py-2.5 text-center text-base font-medium text-accent-contrast">
          Processing scan…
        </div>
      )}
    </div>
  )
}
