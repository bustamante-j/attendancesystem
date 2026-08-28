import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
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
    if (!enabled || !videoRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current('Camera scanning is not supported by this browser.')
      return
    }

    let disposed = false
    let controls: IScannerControls | null = null
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 700,
    })
    setStarting(true)

    void reader.decodeFromConstraints(
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      videoRef.current,
      (result) => {
        if (result && !disposed) onDecodeRef.current(result.getText())
      },
    ).then((nextControls) => {
      setStarting(false)
      if (disposed) nextControls.stop()
      else controls = nextControls
    }).catch((cause: unknown) => {
      setStarting(false)
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
    })

    return () => {
      disposed = true
      controls?.stop()
    }
  }, [enabled])

  return (
    <div className="relative aspect-[3/4] max-h-[68vh] min-h-80 overflow-hidden rounded-xl bg-slate-950 sm:aspect-video">
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="QR scanner camera preview" />
      {!enabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
          <Camera size={42} />
          <span className="text-sm">Camera is off</span>
        </div>
      )}
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-white">
          <LoaderCircle className="animate-spin" size={30} />
          <span className="ml-2 text-sm">Starting camera…</span>
        </div>
      )}
      {enabled && !starting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`h-52 w-52 rounded-2xl border-4 transition ${processing ? 'border-blue-400' : 'border-white/90'}`}>
            <span className="sr-only">Place the QR code inside the frame</span>
          </div>
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
