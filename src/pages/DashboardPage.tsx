import { BarChart3, CalendarDays, CalendarX2, ScanLine } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { DashboardCalendar } from '../components/DashboardCalendar'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { subscribeToAttendance } from '../services/attendance'
import { getEventOverviews, listEvents } from '../services/events'
import type { AttendanceSummary, EventRecord, EventStatus } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const DashboardCharts = lazy(() => import('../components/DashboardCharts').then((module) => ({ default: module.DashboardCharts })))

interface Counts { students: number; departments: number; events: number; users: number }
interface EventSnapshot { event: EventRecord; summary: AttendanceSummary }

const statusTone: Record<EventStatus, StatusTone> = { open: 'ok', draft: 'warn', closed: 'neutral' }

export function DashboardPage() {
  const { profile } = useAuth()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [events, setEvents] = useState<EventRecord[]>([])
  const [snapshots, setSnapshots] = useState<EventSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const loadInFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true
    try {
      const [queries, eventRows] = await Promise.all([
        Promise.all([
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
          supabase.from('departments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('events').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          profile?.role === 'super_admin'
            ? supabase.from('profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null)
            : Promise.resolve({ count: 0, error: null }),
        ]),
        listEvents(),
      ])
      const failed = queries.find((query) => query.error)
      if (failed?.error) throw failed.error
      const recent = eventRows.slice(0, 5)
      const overviews = await getEventOverviews(recent.map((event) => event.id))
      const overviewMap = new Map(overviews.map((overview) => [overview.eventId, overview.summary]))
      const summaries = recent.flatMap((event) => {
        const summary = overviewMap.get(event.id)
        return summary ? [{ event, summary }] : []
      })
      setCounts({ students: queries[0].count ?? 0, departments: queries[1].count ?? 0, events: queries[2].count ?? 0, users: queries[3].count ?? 0 })
      setEvents(eventRows)
      setSnapshots(summaries)
      setError(null)
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      loadInFlightRef.current = false
    }
  }, [profile?.role])

  useEffect(() => {
    let refreshTimer: number | undefined
    const scheduleRefresh = (delay = 500) => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (!document.hidden) void load()
      }, delay)
    }
    scheduleRefresh(0)
    const unsubscribe = subscribeToAttendance(() => scheduleRefresh())
    const interval = window.setInterval(() => scheduleRefresh(0), 60_000)
    const onVisibilityChange = () => { if (!document.hidden) scheduleRefresh(0) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
      window.clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [load])

  if (!counts && !error) return <LoadingScreen />

  const cards = [
    { label: 'Active students', count: counts?.students ?? 0, barColor: '#2563eb' },
    { label: 'Departments', count: counts?.departments ?? 0, barColor: '#60a5fa' },
    { label: 'Events', count: counts?.events ?? 0, barColor: '#1d4ed8' },
    ...(profile?.role === 'super_admin' ? [{ label: 'Staff users', count: counts?.users ?? 0, barColor: '#93c5fd' }] : []),
  ]

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Live attendance across your events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} label="Dashboard overview view" />
          <Link className="btn-secondary" to="/events"><CalendarDays size={15} /> Manage events</Link>
        </div>
      </header>

      {error && <Alert message={error} />}

      {viewMode === 'cards' ? (
        <div className={`stat-strip grid-cols-2 ${cards.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {cards.map(({ label, count }) => (
            <div className="stat" key={label}>
              <div className="stat-label">{label}</div>
              <div className="stat-value">{count.toLocaleString()}</div>
            </div>
          ))}
        </div>
      ) : (
        <Suspense fallback={<div className="surface grid min-h-80 place-items-center text-base text-muted">Loading charts…</div>}>
          <DashboardCharts
            totals={cards.map(({ label, count, barColor }) => ({ label, value: count, color: barColor }))}
            events={snapshots.map(({ event, summary }) => ({ name: event.name, expected: summary.expected, checkedIn: summary.checkedIn }))}
          />
        </Suspense>
      )}

      <DashboardCalendar events={events} />

      <section className="table-shell">
        <div className="surface-head">
          <div>
            <h2 className="section-title">Recent attendance</h2>
            <p className="section-note">Latest summaries across your events.</p>
          </div>
          <Link className="btn-secondary btn-sm" to="/reports"><BarChart3 size={14} /> Open reports</Link>
        </div>

        {snapshots.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th className="min-w-44">Attendance</th>
                  <th>Status</th>
                  <th className="w-px" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map(({ event, summary }) => {
                  const rate = summary.expected ? Math.min(100, Math.round((summary.checkedIn / summary.expected) * 100)) : 0
                  return (
                    <tr key={event.id}>
                      <td className="max-w-64"><div className="cell-title truncate">{event.name}</div></td>
                      <td className="whitespace-nowrap text-muted">{formatManilaDate(event.start_at)}</td>
                      <td>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <span className="tabular-nums text-ink">{summary.checkedIn.toLocaleString()} / {summary.expected.toLocaleString()}</span>
                          <span className="text-meta tabular-nums text-muted">{rate}%</span>
                        </div>
                        <div className="meter"><div className="meter-fill" style={{ width: `${rate}%` }} /></div>
                      </td>
                      <td><StatusBadge tone={statusTone[event.status]}>{event.status}</StatusBadge></td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <Link className="btn-secondary btn-sm" to={`/reports?event=${event.id}`}><BarChart3 size={14} /> Report</Link>
                          {event.status === 'open' && (
                            <Link className="btn-primary btn-sm" to={`/events/${event.id}/scanner`}><ScanLine size={14} /> Scan</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            compact
            icon={CalendarX2}
            title="No events yet"
            description="Create your first event to start tracking attendance."
            action={<Link className="btn-primary" to="/events"><CalendarDays size={15} /> Create event</Link>}
          />
        )}
      </section>
    </div>
  )
}
