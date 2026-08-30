import { Activity, BarChart3, Building2, CalendarDays, CalendarX2, ScanLine, Users, UserRoundCog } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { DashboardCalendar } from '../components/DashboardCalendar'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { getAttendanceSummary, subscribeToAttendance } from '../services/attendance'
import { listEvents } from '../services/events'
import type { AttendanceSummary, EventRecord } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const DashboardCharts = lazy(() => import('../components/DashboardCharts').then((module) => ({ default: module.DashboardCharts })))

interface Counts { students: number; departments: number; events: number; users: number }
interface EventSnapshot { event: EventRecord; summary: AttendanceSummary }

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
      const summaries = await Promise.all(recent.map(async (event) => ({ event, summary: await getAttendanceSummary(event.id) })))
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
    { label: 'Active Students', count: counts?.students ?? 0, icon: Users, barColor: '#2563eb' },
    { label: 'Departments', count: counts?.departments ?? 0, icon: Building2, barColor: '#3b82f6' },
    { label: 'Events', count: counts?.events ?? 0, icon: CalendarDays, barColor: '#1d4ed8' },
    ...(profile?.role === 'super_admin' ? [{ label: 'Staff Users', count: counts?.users ?? 0, icon: UserRoundCog, barColor: '#60a5fa' }] : []),
  ]
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle inline-flex items-center gap-1.5"><Activity size={15} className="text-emerald-600" /> Live operational overview</p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          <ViewModeToggle value={viewMode} onChange={setViewMode} label="Dashboard overview view" />
          <Link className="btn-primary" to="/events"><CalendarDays size={16} /> Manage events</Link>
        </div>
      </div>
      {error && <div className="mt-5"><Alert message={error} /></div>}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {cards.map(({ label, count, icon: Icon }) => (
            <div className="panel group relative flex min-h-28 items-center gap-3 overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:min-h-32 sm:gap-4 sm:p-5 dark:hover:border-blue-900" key={label}>
              <span className="absolute inset-y-0 left-0 w-1 bg-blue-600" />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-100 sm:h-12 sm:w-12 dark:bg-blue-950/70 dark:text-blue-300 dark:group-hover:bg-blue-950"><Icon size={21} /></span>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">{label}</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">{count.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Suspense fallback={<section className="panel grid min-h-80 place-items-center text-sm text-slate-500">Loading dashboard graphs…</section>}>
          <DashboardCharts
            totals={cards.map(({ label, count, barColor }) => ({ label, value: count, color: barColor }))}
            events={snapshots.map(({ event, summary }) => ({ name: event.name, expected: summary.expected, checkedIn: summary.checkedIn }))}
          />
        </Suspense>
      )}
      <DashboardCalendar events={events} />
      <section className="panel overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5 dark:border-slate-800">
          <div><h2 className="text-base font-semibold">Recent event attendance</h2><p className="mt-1 text-sm text-slate-500">Latest attendance summaries across events.</p></div>
          <Link className="btn-secondary" to="/reports"><BarChart3 size={16} /> Open reports</Link>
        </div>
        {!!snapshots.length && (
          <div className="hidden grid-cols-[minmax(0,1.3fr)_10rem_minmax(12rem,0.9fr)_auto] gap-5 border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 text-[0.68rem] font-bold uppercase tracking-wider text-slate-400 md:grid dark:border-slate-800 dark:bg-slate-950/40">
            <span>Event</span><span>Date</span><span>Attendance</span><span className="text-right">Actions</span>
          </div>
        )}
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {snapshots.map(({ event, summary }) => {
            const rate = summary.expected ? Math.min(100, Math.round((summary.checkedIn / summary.expected) * 100)) : 0
            const statusDot = event.status === 'open' ? 'bg-emerald-500' : event.status === 'draft' ? 'bg-amber-500' : 'bg-slate-400'
            return (
              <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.3fr)_10rem_minmax(12rem,0.9fr)_auto] md:items-center md:gap-5 sm:px-5" key={event.id}>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} /><span className="truncate text-sm font-semibold">{event.name}</span></div>
                  <div className="mt-1 text-xs text-slate-500 md:hidden">{formatManilaDate(event.start_at)}</div>
                </div>
                <div className="hidden text-xs text-slate-500 md:block">{formatManilaDate(event.start_at)}</div>
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{summary.checkedIn.toLocaleString()} / {summary.expected.toLocaleString()}</span><span className="font-semibold text-slate-700 dark:text-slate-200">{rate}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${rate}%` }} /></div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end"><Link className="btn-secondary min-h-8 px-2.5 py-1 text-xs" to={`/reports?event=${event.id}`}><BarChart3 size={13} /> Report</Link>{event.status === 'open' && <Link className="btn-primary min-h-8 px-2.5 py-1 text-xs" to={`/events/${event.id}/scanner`}><ScanLine size={13} /> Scan</Link>}</div>
              </div>
            )
          })}
          {!snapshots.length && <div className="p-5"><EmptyState compact icon={CalendarX2} title="No events yet" description="Create your first event to start tracking attendance." action={<Link className="btn-primary" to="/events"><CalendarDays size={16} /> Create event</Link>} /></div>}
        </div>
      </section>
    </div>
  )
}
