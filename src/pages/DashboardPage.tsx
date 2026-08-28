import { Activity, BarChart3, Building2, CalendarDays, CalendarX2, ScanLine, Users, UserRoundCog } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { MetricBarChart } from '../components/MetricBarChart'
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { getAttendanceSummary, subscribeToAttendance } from '../services/attendance'
import { listEvents } from '../services/events'
import type { AttendanceSummary, EventRecord } from '../types/app'
import { formatManilaDate } from '../utils/dates'

interface Counts { students: number; departments: number; events: number; users: number }
interface EventSnapshot { event: EventRecord; summary: AttendanceSummary }

export function DashboardPage() {
  const { profile } = useAuth()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [snapshots, setSnapshots] = useState<EventSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')

  const load = useCallback(async () => {
    try {
      const [queries, eventRows] = await Promise.all([
        Promise.all([
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
          supabase.from('departments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('events').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          profile?.role === 'super_admin'
            ? supabase.from('profiles').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0, error: null }),
        ]),
        listEvents(),
      ])
      const failed = queries.find((query) => query.error)
      if (failed?.error) throw failed.error
      const recent = eventRows.slice(0, 5)
      const summaries = await Promise.all(recent.map(async (event) => ({ event, summary: await getAttendanceSummary(event.id) })))
      setCounts({ students: queries[0].count ?? 0, departments: queries[1].count ?? 0, events: queries[2].count ?? 0, users: queries[3].count ?? 0 })
      setSnapshots(summaries)
      setError(null)
    } catch (cause) {
      setError(friendlyError(cause))
    }
  }, [profile?.role])

  useEffect(() => {
    void load()
    const unsubscribe = subscribeToAttendance(() => { void load() })
    const interval = window.setInterval(() => { void load() }, 15_000)
    return () => { unsubscribe(); window.clearInterval(interval) }
  }, [load])

  if (!counts && !error) return <LoadingScreen />
  const cards = [
    { label: 'Active Students', count: counts?.students ?? 0, icon: Users, color: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300', barColor: 'bg-blue-600' },
    { label: 'Departments', count: counts?.departments ?? 0, icon: Building2, color: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300', barColor: 'bg-violet-500' },
    { label: 'Events', count: counts?.events ?? 0, icon: CalendarDays, color: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', barColor: 'bg-amber-500' },
    ...(profile?.role === 'super_admin' ? [{ label: 'Staff Users', count: counts?.users ?? 0, icon: UserRoundCog, color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', barColor: 'bg-emerald-500' }] : []),
  ]
  return (
    <div className="space-y-6">
      <div className="page-header">
        <div><h1 className="page-title">Dashboard</h1><p className="page-subtitle inline-flex items-center gap-1.5"><Activity size={15} className="text-emerald-600" /> Live operational overview</p></div>
        <div className="flex flex-wrap items-center gap-2"><ViewModeToggle value={viewMode} onChange={setViewMode} label="Dashboard overview view" /><Link className="btn-primary" to="/events"><CalendarDays size={16} /> Manage events</Link></div>
      </div>
      {error && <div className="mt-5"><Alert message={error} /></div>}
      {viewMode === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, count, icon: Icon, color }) => (
            <div className="panel group flex items-start justify-between transition hover:-translate-y-0.5 hover:shadow-md" key={label}>
              <div><div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div><div className="mt-2 text-3xl font-bold tracking-tight">{count.toLocaleString()}</div></div>
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}><Icon size={21} /></span>
            </div>
          ))}
        </div>
      ) : (
        <MetricBarChart title="Workspace totals" description="A visual comparison of the records currently managed by Attendly." items={cards.map(({ label, count, barColor }) => ({ label, value: count, color: barColor }))} />
      )}
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Recent event attendance</h2><p className="mt-1 text-sm text-slate-500">Updates automatically when attendance changes.</p></div><Link className="btn-secondary" to="/reports"><BarChart3 size={16} /> Open reports</Link></div>
        <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
          {snapshots.map(({ event, summary }) => {
            const rate = summary.expected ? Math.min(100, Math.round((summary.checkedIn / summary.expected) * 100)) : 0
            return <div className="py-5 first:pt-0 last:pb-0" key={event.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{event.name}</div><div className="mt-1 text-xs text-slate-500">{formatManilaDate(event.start_at)} · {summary.checkedIn.toLocaleString()}/{summary.expected.toLocaleString()} checked in</div></div><div className="flex gap-2"><Link className="btn-secondary" to={`/reports?event=${event.id}`}><BarChart3 size={14} /> Report</Link>{event.status === 'open' && <Link className="btn-primary" to={`/events/${event.id}/scanner`}><ScanLine size={14} /> Scan</Link>}</div></div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${rate}%` }} /></div><span className="w-9 text-right text-xs font-semibold text-slate-500">{rate}%</span></div></div>
          })}
          {!snapshots.length && <EmptyState compact icon={CalendarX2} title="No events yet" description="Create your first event to start tracking attendance." action={<Link className="btn-primary" to="/events/new"><CalendarDays size={16} /> Create event</Link>} />}
        </div>
      </section>
    </div>
  )
}
