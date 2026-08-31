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
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Development tools</h1>
          <p className="page-subtitle">Backend verification. Omitted from production navigation.</p>
        </div>
      </header>

      {error && <Alert message={error} />}

      <section className="surface p-5">
        <h2 className="section-title">Current session</h2>
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <dt className="stat-label">Auth user</dt>
            <dd className="mt-0.5 break-all font-mono text-meta text-ink">{session?.user.id}</dd>
          </div>
          <div>
            <dt className="stat-label">Profile</dt>
            <dd className="mt-0.5 text-ink">{profile?.username} — {profile?.role}</dd>
          </div>
        </dl>
      </section>

      <section className="surface p-5">
        <h2 className="section-title">Event PIN test</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="field max-w-md" value={eventId} onChange={(event) => setEventId(event.target.value)}>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.status})</option>)}
          </select>
          <input
            className="field max-w-36"
            placeholder="6-digit PIN"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          />
          <button className="btn-secondary" onClick={() => void verifyPin()}>Verify PIN</button>
        </div>
      </section>

      <section className="surface p-5">
        <h2 className="section-title">Attendance RPC test</h2>
        <p className="section-note">Paste the one-time raw credential shown after issuing a student's QR credential.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_11rem_auto]">
          <input className="field" placeholder="ATTENDLY_… credential" value={credential} onChange={(event) => setCredential(event.target.value)} />
          <select className="field" value={direction} onChange={(event) => setDirection(event.target.value as 'check_in' | 'check_out')}>
            <option value="check_in">Check in</option>
            <option value="check_out">Check out</option>
          </select>
          <button className="btn-primary" onClick={() => void scan()}>Process test scan</button>
        </div>
      </section>

      {result !== null && (
        <section className="surface p-5">
          <h2 className="section-title">RPC result</h2>
          <pre className="mt-3 overflow-auto rounded-lg border border-line bg-sunken p-4 text-meta text-ink">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </div>
  )
}
