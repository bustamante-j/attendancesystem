import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { processTestScan, verifyEventPin } from '../services/attendance'
import { listEvents } from '../services/events'
import type { EventRecord } from '../types/app'

export function DevPage() {
  const { session, profile } = useAuth()
  const [events, setEvents] = useState<EventRecord[]>([])
  const [eventId, setEventId] = useState('')
  const [credential, setCredential] = useState('')
  const [direction, setDirection] = useState<'check_in' | 'check_out'>('check_in')
  const [pin, setPin] = useState('')
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listEvents().then((rows) => { setEvents(rows); setEventId(rows[0]?.id ?? '') }).catch((cause) => setError(friendlyError(cause)))
  }, [])

  if (!import.meta.env.DEV) return <Navigate to="/" replace />

  const scan = async () => {
    setError(null)
    try { setResult(await processTestScan(eventId, credential.trim(), direction)) }
    catch (cause) { setError(friendlyError(cause)) }
  }

  const verifyPin = async () => {
    setError(null)
    try { setResult(await verifyEventPin(eventId, pin)) }
    catch (cause) { setError(friendlyError(cause)) }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Development Tools</h1><p className="mt-1 text-sm text-slate-500">Development-only backend verification. This route is omitted from production navigation.</p></div>
      {error && <Alert message={error} />}
      <div className="panel">
        <h2 className="font-semibold">Current session</h2>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="text-slate-500">Auth user</dt><dd className="font-mono">{session?.user.id}</dd></div><div><dt className="text-slate-500">Profile</dt><dd>{profile?.username} — {profile?.role}</dd></div></dl>
      </div>
      <div className="panel">
        <h2 className="font-semibold">Event PIN test</h2>
        <div className="mt-3 flex flex-wrap gap-3"><select className="field max-w-md" value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.status})</option>)}</select><input className="field max-w-40" placeholder="6-digit PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} /><button className="btn-secondary" onClick={() => void verifyPin()}>Verify PIN</button></div>
      </div>
      <div className="panel">
        <h2 className="font-semibold">Attendance RPC test</h2>
        <p className="mt-1 text-sm text-slate-500">Paste the one-time raw credential shown after issuing a student's QR credential.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto]"><input className="field" placeholder="KCP_… credential" value={credential} onChange={(event) => setCredential(event.target.value)} /><select className="field" value={direction} onChange={(event) => setDirection(event.target.value as 'check_in' | 'check_out')}><option value="check_in">Check in</option><option value="check_out">Check out</option></select><button className="btn-primary" onClick={() => void scan()}>Process test scan</button></div>
      </div>
      {result !== null && <div className="panel"><h2 className="font-semibold">RPC result</h2><pre className="mt-3 overflow-auto rounded bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(result, null, 2)}</pre></div>}
    </div>
  )
}
