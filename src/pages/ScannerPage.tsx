import { ArrowLeft, Camera, CameraOff, CheckCircle2, ScanLine, TriangleAlert, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { SegmentedControl } from '../components/SegmentedControl'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
import { ManualAttendancePanel } from '../features/attendance/ManualAttendancePanel'
import { ScannerCamera } from '../features/attendance/ScannerCamera'
import { playScanFeedback, primeScanFeedback, type ScanFeedbackTone } from '../features/attendance/feedback'
import { useAuth } from '../features/auth/AuthProvider'
import { EventWorkspaceNav } from '../features/events/EventWorkspaceNav'
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
import type { AttendanceResult, AttendanceSummary, EventRecord, EventStatus } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const EMPTY_SUMMARY: AttendanceSummary = { expected: 0, checkedIn: 0, remaining: 0, present: 0, late: 0, checkedOut: 0 }

const statusTone: Record<EventStatus, StatusTone> = { open: 'ok', draft: 'warn', closed: 'neutral' }

interface RecentScan {
  id: string
  result: AttendanceResult
  method: 'qr' | 'manual'
  recordedAt: Date
}

interface AttendancePopup {
  result: AttendanceResult
  method: 'qr' | 'manual'
}

function resultTone(code: string): ScanFeedbackTone {
  if (code === 'success_present' || code === 'success_checkout' || code === 'undo_success') return 'success'
  if (code === 'success_late' || code.startsWith('already_')) return 'warning'
  return 'error'
}

/** Border + fill, for the floating scan confirmation. */
function resultStyles(tone: ScanFeedbackTone) {
  if (tone === 'success') return 'border-ok/30 bg-ok-soft text-ok-ink'
  if (tone === 'warning') return 'border-warn/30 bg-warn-soft text-warn-ink'
  return 'border-bad/30 bg-bad-soft text-bad-ink'
}

/** Fill only, for the result banner already framed by its surface. */
function resultFill(tone: ScanFeedbackTone) {
  if (tone === 'success') return 'bg-ok-soft text-ok-ink'
  if (tone === 'warning') return 'bg-warn-soft text-warn-ink'
  return 'bg-bad-soft text-bad-ink'
}

function ResultIcon({ tone, size = 20 }: { tone: ScanFeedbackTone; size?: number }) {
  if (tone === 'success') return <CheckCircle2 className="shrink-0" size={size} />
  if (tone === 'warning') return <TriangleAlert className="shrink-0" size={size} />
  return <XCircle className="shrink-0" size={size} />
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
  const [scanPopup, setScanPopup] = useState<AttendancePopup | null>(null)
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

  useEffect(() => {
    if (!scanPopup) return
    const timeout = window.setTimeout(() => setScanPopup(null), 5_000)
    return () => window.clearTimeout(timeout)
  }, [scanPopup])

  const handleAttendanceResult = useCallback(async (nextResult: AttendanceResult, method: 'qr' | 'manual') => {
    const tone = resultTone(nextResult.code)
    setResult(nextResult)
    if (nextResult.student) setScanPopup({ result: nextResult, method })
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
      <div className="mx-auto max-w-xl space-y-4">
        <Link className="btn-secondary" to="/events"><ArrowLeft size={15} /> Events</Link>
        <Alert message={error ?? 'The event could not be loaded.'} />
      </div>
    )
  }

  const currentTone = result ? resultTone(result.code) : null
  const stats: Array<[string, number]> = [
    ['Expected', summary.expected],
    ['Checked in', summary.checkedIn],
    ['Remaining', summary.remaining],
    ['Present', summary.present],
    ['Late', summary.late],
    ...(eventRecord.attendance_mode === 'check_in_out' ? [['Checked out', summary.checkedOut] as [string, number]] : []),
  ]

  return (
    <div className="page mx-auto max-w-5xl">
      <header className="page-header">
        <div className="min-w-0">
          <Link className="mb-2 inline-flex items-center gap-1.5 text-meta text-muted transition-colors hover:text-ink" to="/events">
            <ArrowLeft size={14} /> Back to events
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{eventRecord.name}</h1>
            <StatusBadge tone={statusTone[eventRecord.status]} variant="soft">{eventRecord.status}</StatusBadge>
          </div>
          <p className="page-subtitle">{eventRecord.venue || 'No venue'} · {formatManilaDate(eventRecord.start_at)}</p>
        </div>
      </header>

      <EventWorkspaceNav eventRecord={eventRecord} active="scanner" canViewReports={profile?.role !== 'officer'} />

      {error && <Alert message={error} />}

      {eventRecord.status !== 'open' ? (
        <Alert tone="info" message="This event is not open. Open it from the Events page before recording attendance." />
      ) : !hasAccess ? (
        <section className="surface mx-auto max-w-sm px-6 py-8 text-center">
          <ScanLine className="mx-auto text-accent" size={26} strokeWidth={1.75} />
          <h2 className="mt-3 text-lg font-semibold">Enter event PIN</h2>
          <p className="mt-1 text-base text-muted">Assigned staff must verify the current 6-digit PIN before the scanner opens.</p>
          <input
            className="field kbd-pin mx-auto mt-5 max-w-52"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            value={pin}
            onChange={(inputEvent) => setPin(inputEvent.target.value.replace(/\D/g, ''))}
            onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === 'Enter') void grantAccess() }}
            placeholder="000000"
            aria-label="6-digit event PIN"
          />
          <button className="btn-primary mt-4 w-full max-w-52" disabled={pin.length !== 6 || pinBusy} onClick={() => void grantAccess()}>
            {pinBusy ? 'Verifying…' : 'Continue to scanner'}
          </button>
        </section>
      ) : (
        <>
          {scanPopup?.result.student && (
            <div className="pointer-events-none fixed inset-x-3 top-20 z-[70] flex justify-center" aria-live="assertive" aria-atomic="true">
              <div
                className={`animate-overlay w-full max-w-xl rounded-2xl border px-5 py-4 shadow-overlay backdrop-blur ${resultStyles(resultTone(scanPopup.result.code))}`}
                role="status"
              >
                <div className="flex items-center gap-4">
                  <ResultIcon tone={resultTone(scanPopup.result.code)} size={30} />
                  <div className="min-w-0">
                    <div className="text-meta font-medium uppercase tracking-wide opacity-75">
                      {scanPopup.method === 'qr' ? 'QR scan recorded' : 'Manual attendance recorded'}
                    </div>
                    <div className="break-words text-3xl font-semibold leading-tight tracking-tight">{scanPopup.result.student.fullName}</div>
                    <div className="mt-0.5 font-mono text-base">{scanPopup.result.student.studentNumber}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <section className="table-shell" aria-labelledby="qr-scanner-title">
            <div className="surface-head">
              <div>
                <h2 className="section-title" id="qr-scanner-title">QR scanner</h2>
                <p className="section-note">Place the student QR inside the frame. Repeat scans wait 3 seconds.</p>
              </div>
              {eventRecord.attendance_mode === 'check_in_out' ? (
                <SegmentedControl
                  value={direction}
                  onChange={setDirection}
                  label="Attendance direction"
                  options={[
                    { value: 'check_in', label: 'Check in' },
                    { value: 'check_out', label: 'Check out' },
                  ]}
                />
              ) : (
                <span className="badge badge-accent">Checking in</span>
              )}
            </div>

            <div className="p-3 sm:p-5">
              <ScannerCamera enabled={cameraActive} processing={processing} onDecode={processCredential} onError={handleCameraError} />
              {cameraError && <div className="mt-3"><Alert message={cameraError} /></div>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-meta text-muted">Requires HTTPS and camera permission.</p>
                {cameraActive
                  ? <button className="btn-secondary w-full sm:w-auto" onClick={() => setCameraActive(false)}><CameraOff size={16} /> Stop camera</button>
                  : <button className="btn-primary w-full sm:w-auto" onClick={() => void startCamera()}><Camera size={16} /> Start camera</button>}
              </div>
            </div>
          </section>

          <section className="stat-strip grid-cols-3 lg:grid-cols-6" aria-label="Live attendance counts">
            {stats.map(([label, count]) => (
              <div className="stat" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value text-2xl">{count.toLocaleString()}</div>
              </div>
            ))}
          </section>

          <section className="table-shell" aria-live="polite" aria-atomic="true">
            <div className="surface-head">
              <h2 className="section-title">Scan activity</h2>
              <span className="text-meta text-muted">{recentScans.length ? `${recentScans.length} this session` : 'Nothing yet'}</span>
            </div>

            {result && currentTone && (
              <div className={`border-b border-line px-5 py-4 ${resultFill(currentTone)}`}>
                <div className="flex items-start gap-3">
                  <ResultIcon tone={currentTone} />
                  <div className="min-w-0">
                    <div className="font-medium">{result.student?.fullName ?? 'Scan result'}</div>
                    {result.student && <div className="text-meta font-mono opacity-80">{result.student.studentNumber}</div>}
                    <p className="mt-1 text-base">{result.message}</p>
                  </div>
                </div>
              </div>
            )}

            {recentScans.length ? (
              <ul className="divide-y divide-line">
                {recentScans.map((scan) => (
                  <li className="flex items-center justify-between gap-3 px-5 py-2.5" key={scan.id}>
                    <div className="min-w-0">
                      <div className="truncate text-base text-ink">{scan.result.student?.fullName ?? scan.result.message}</div>
                      <div className="cell-meta capitalize">{scan.method} · {scan.result.code.replaceAll('_', ' ')}</div>
                    </div>
                    <span className="shrink-0 text-meta tabular-nums text-muted">
                      {scan.recordedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !result && (
              <p className="px-5 py-8 text-center text-base text-muted">Scan results will appear here.</p>
            )}
          </section>

          <ManualAttendancePanel eventId={eventId} direction={direction} onResult={handleAttendanceResult} />
        </>
      )}
    </div>
  )
}
