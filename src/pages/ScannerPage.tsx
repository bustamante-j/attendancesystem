import { ArrowLeft, Camera, CameraOff, CheckCircle2, Clock3, ScanLine, TriangleAlert, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { ManualAttendancePanel } from '../features/attendance/ManualAttendancePanel'
import { ScannerCamera } from '../features/attendance/ScannerCamera'
import { playScanFeedback, primeScanFeedback, type ScanFeedbackTone } from '../features/attendance/feedback'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import {
  getAttendanceSummary,
  hasEventAccess,
  processAttendanceScan,
  subscribeToEventAttendance,
  verifyEventPin,
  type AttendanceDirection,
} from '../services/attendance'
import { getEvent } from '../services/events'
import type { AttendanceResult, AttendanceSummary, EventRecord } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const EMPTY_SUMMARY: AttendanceSummary = {
  expected: 0,
  checkedIn: 0,
  remaining: 0,
  present: 0,
  late: 0,
  checkedOut: 0,
}

interface RecentScan {
  id: string
  result: AttendanceResult
  method: 'qr' | 'manual'
  recordedAt: Date
}

function resultTone(code: string): ScanFeedbackTone {
  if (code === 'success_present' || code === 'success_checkout' || code === 'undo_success') return 'success'
  if (code === 'success_late' || code.startsWith('already_')) return 'warning'
  return 'error'
}

function resultStyles(tone: ScanFeedbackTone) {
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100'
  if (tone === 'warning') return 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-100'
  return 'border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/70 dark:text-red-100'
}

function ResultIcon({ tone }: { tone: ScanFeedbackTone }) {
  if (tone === 'success') return <CheckCircle2 className="text-emerald-700" size={28} />
  if (tone === 'warning') return <TriangleAlert className="text-amber-700" size={28} />
  return <XCircle className="text-red-700" size={28} />
}

export function ScannerPage() {
  const { eventId } = useParams()
  const { profile } = useAuth()
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null)
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_SUMMARY)
  const [hasAccess, setHasAccess] = useState(false)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [direction, setDirection] = useState<AttendanceDirection>('check_in')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<AttendanceResult | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const processingRef = useRef(false)
  const lastCredentialRef = useRef<{ value: string; scannedAt: number } | null>(null)
  const summaryRefreshInFlightRef = useRef(false)

  const refreshSummary = useCallback(async () => {
    if (!eventId || summaryRefreshInFlightRef.current) return
    summaryRefreshInFlightRef.current = true
    try { setSummary(await getAttendanceSummary(eventId)) }
    catch (cause) { setError(friendlyError(cause, 'Live attendance counts could not be refreshed.')) }
    finally { summaryRefreshInFlightRef.current = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId || !profile) return
    let current = true
    setLoading(true)
    setError(null)
    void Promise.all([
      getEvent(eventId),
      hasEventAccess(eventId, profile.id, profile.role === 'super_admin'),
    ]).then(async ([nextEvent, access]) => {
      const nextSummary = access ? await getAttendanceSummary(eventId) : EMPTY_SUMMARY
      if (!current) return
      setEventRecord(nextEvent)
      setSummary(nextSummary)
      setHasAccess(access)
      if (
        nextEvent.attendance_mode === 'check_in_out'
        && nextEvent.check_out_opens_at
        && Date.now() >= new Date(nextEvent.check_out_opens_at).getTime()
      ) setDirection('check_out')
    }).catch((cause: unknown) => {
      if (current) setError(friendlyError(cause, 'This scanner event is unavailable or you are not assigned to it.'))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [eventId, profile])

  useEffect(() => {
    if (!eventId || !eventRecord || !hasAccess) return
    let refreshTimer: number | undefined
    const scheduleRefresh = (delay = 300) => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (!document.hidden) void refreshSummary()
      }, delay)
    }
    const unsubscribe = subscribeToEventAttendance(eventId, () => scheduleRefresh())
    const interval = window.setInterval(() => scheduleRefresh(0), 30_000)
    const onVisibilityChange = () => { if (!document.hidden) scheduleRefresh(0) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
      window.clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [eventId, eventRecord, hasAccess, refreshSummary])

  useEffect(() => {
    const stopWhenHidden = () => { if (document.hidden) setCameraActive(false) }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [])

  const handleAttendanceResult = useCallback(async (nextResult: AttendanceResult, method: 'qr' | 'manual') => {
    const tone = resultTone(nextResult.code)
    setResult(nextResult)
    setRecentScans((current) => [{
      id: crypto.randomUUID(),
      result: nextResult,
      method,
      recordedAt: new Date(),
    }, ...current].slice(0, 8))
    playScanFeedback(tone)
    if (nextResult.code === 'unauthorized') {
      setHasAccess(false)
      setCameraActive(false)
    }
    await refreshSummary()
  }, [refreshSummary])

  const processCredential = useCallback((rawCredential: string) => {
    if (!eventId || processingRef.current) return
    const credential = rawCredential.trim()
    if (!credential) return
    const now = Date.now()
    if (
      lastCredentialRef.current?.value === credential
      && now - lastCredentialRef.current.scannedAt < 3_000
    ) return

    lastCredentialRef.current = { value: credential, scannedAt: now }
    processingRef.current = true
    setProcessing(true)
    void processAttendanceScan(eventId, credential, direction).then((nextResult) => (
      handleAttendanceResult(nextResult, 'qr')
    )).catch((cause: unknown) => (
      handleAttendanceResult({ code: 'request_failed', message: friendlyError(cause, 'The scan could not be processed. Check the connection and try again.') }, 'qr')
    )).finally(() => {
      processingRef.current = false
      setProcessing(false)
    })
  }, [direction, eventId, handleAttendanceResult])

  const grantAccess = async () => {
    if (!eventId || pin.length !== 6) return
    setPinBusy(true)
    setError(null)
    try {
      const response = await verifyEventPin(eventId, pin)
      if (response.code === 'success') {
        setHasAccess(true)
        setPin('')
        await refreshSummary()
      } else setError(response.message)
    } catch (cause) {
      setError(friendlyError(cause, 'The event PIN could not be verified.'))
    } finally {
      setPinBusy(false)
    }
  }

  const startCamera = async () => {
    setCameraError(null)
    await primeScanFeedback()
    setCameraActive(true)
  }

  const handleCameraError = useCallback((message: string) => {
    setCameraError(message)
    setCameraActive(false)
  }, [])

  if (!eventId) return <Navigate to="/events" replace />
  if (loading) return <LoadingScreen label="Preparing scanner…" />

  if (!eventRecord) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link className="btn-secondary" to="/events"><ArrowLeft size={16} /> Events</Link>
        <Alert message={error ?? 'The event could not be loaded.'} />
      </div>
    )
  }

  const currentTone = result ? resultTone(result.code) : null
  const summaryCards = [
    ['Expected', summary.expected],
    ['Checked in', summary.checkedIn],
    ['Remaining', summary.remaining],
    ['Present', summary.present],
    ['Late', summary.late],
    ...(eventRecord.attendance_mode === 'check_in_out' ? [['Checked out', summary.checkedOut] as [string, number]] : []),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="page-header">
        <div>
          <Link className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900" to="/events"><ArrowLeft size={16} /> Back to events</Link>
          <h1 className="page-title">{eventRecord.name}</h1>
          <p className="page-subtitle">{eventRecord.venue || 'No venue'} · {formatManilaDate(eventRecord.start_at)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium capitalize ${eventRecord.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{eventRecord.status}</span>
      </header>

      {error && <Alert message={error} />}

      {eventRecord.status !== 'open' ? (
        <Alert message="This event is not open. Open it from the Events page before recording attendance." tone="info" />
      ) : !hasAccess ? (
        <section className="panel mx-auto max-w-lg text-center">
          <ScanLine className="mx-auto text-blue-700" size={38} />
          <h2 className="mt-3 text-lg font-semibold">Enter event PIN</h2>
          <p className="mt-1 text-sm text-slate-500">Assigned staff must verify the current 6-digit PIN before the scanner opens.</p>
          <input
            className="field mx-auto mt-5 max-w-56 text-center font-mono text-2xl tracking-[0.3em]"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            value={pin}
            onChange={(inputEvent) => setPin(inputEvent.target.value.replace(/\D/g, ''))}
            onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === 'Enter') void grantAccess() }}
            placeholder="000000"
            aria-label="6-digit event PIN"
          />
          <button className="btn-primary mt-4 w-full max-w-56" disabled={pin.length !== 6 || pinBusy} onClick={() => void grantAccess()}>
            {pinBusy ? 'Verifying…' : 'Continue to scanner'}
          </button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Live attendance counts">
            {summaryCards.map(([label, count]) => (
              <div className="panel p-3.5 sm:p-4" key={label}>
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{count.toLocaleString()}</div>
              </div>
            ))}
          </section>

          <section className="panel sticky top-20 z-[5] p-3 shadow-md sm:p-4 md:static md:shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Attendance direction</h2>
                <p className="text-xs text-slate-500">The database validates the selected event window.</p>
              </div>
              <div className="inline-flex w-full rounded-xl border border-slate-300 bg-slate-100 p-1 sm:w-auto dark:border-slate-700 dark:bg-slate-800">
                <button aria-pressed={direction === 'check_in'} className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${direction === 'check_in' ? 'bg-white text-blue-800 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`} onClick={() => setDirection('check_in')}>Check in</button>
                {eventRecord.attendance_mode === 'check_in_out' && <button aria-pressed={direction === 'check_out'} className={`min-h-10 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${direction === 'check_out' ? 'bg-white text-blue-800 shadow-sm dark:bg-slate-950 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'}`} onClick={() => setDirection('check_out')}>Check out</button>}
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <section className="panel p-2 sm:p-5">
              <ScannerCamera enabled={cameraActive} processing={processing} onDecode={processCredential} onError={handleCameraError} />
              {cameraError && <div className="mt-3"><Alert message={cameraError} /></div>}
              {result && currentTone && (
                <div className={`mt-3 rounded-xl border p-3 lg:hidden ${resultStyles(currentTone)}`} aria-live="assertive" aria-atomic="true">
                  <div className="flex items-start gap-3"><ResultIcon tone={currentTone} /><div className="min-w-0"><div className="font-semibold">{result.student?.fullName ?? 'Scan result'}</div>{result.student && <div className="text-sm opacity-80">{result.student.studentNumber}</div>}<p className="mt-1 text-sm">{result.message}</p></div></div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Use HTTPS and allow camera permission. Scans have a 3-second repeat cooldown.</p>
                {cameraActive
                  ? <button className="btn-secondary w-full sm:w-auto" onClick={() => setCameraActive(false)}><CameraOff size={17} /> Stop camera</button>
                  : <button className="btn-primary w-full sm:w-auto" onClick={() => void startCamera()}><Camera size={17} /> Start camera</button>}
              </div>
            </section>

            <div className="space-y-5">
              <section className="panel hidden min-h-40 lg:block" aria-live="assertive" aria-atomic="true">
                {!result || !currentTone ? (
                  <div className="flex min-h-28 flex-col items-center justify-center text-center text-slate-500">
                    <ScanLine size={30} />
                    <p className="mt-2 text-sm">The latest scan result will appear here.</p>
                  </div>
                ) : (
                  <div className={`rounded-lg border p-4 ${resultStyles(currentTone)}`}>
                    <div className="flex items-start gap-3">
                      <ResultIcon tone={currentTone} />
                      <div className="min-w-0">
                        <div className="font-semibold">{result.student?.fullName ?? 'Scan result'}</div>
                        {result.student && <div className="text-sm opacity-80">{result.student.studentNumber}</div>}
                        <p className="mt-2 text-sm">{result.message}</p>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="flex items-center gap-2"><Clock3 size={18} /><h2 className="font-semibold">Recent activity</h2></div>
                <div className="mt-3 divide-y">
                  {recentScans.map((scan) => (
                    <div className="py-3 first:pt-0 last:pb-0" key={scan.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{scan.result.student?.fullName ?? scan.result.message}</span>
                        <span className="shrink-0 text-xs text-slate-500">{scan.recordedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{scan.method === 'qr' ? 'QR' : 'Manual'} · {scan.result.code.replaceAll('_', ' ')}</div>
                    </div>
                  ))}
                  {!recentScans.length && <p className="py-5 text-center text-sm text-slate-500">No scans in this session.</p>}
                </div>
              </section>
            </div>
          </div>

          <ManualAttendancePanel eventId={eventId} direction={direction} onResult={handleAttendanceResult} />
        </>
      )}
    </div>
  )
}
