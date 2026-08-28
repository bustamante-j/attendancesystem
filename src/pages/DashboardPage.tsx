import { Activity, BarChart3, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
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
    ['Active Students', counts?.students ?? 0],
    ['Departments', counts?.departments ?? 0],
    ['Events', counts?.events ?? 0],
    ...(profile?.role === 'super_admin' ? [['Users', counts?.users ?? 0] as [string, number]] : []),
  ]
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-500"><Activity size={15} className="text-emerald-600" /> Live operational overview</p></div>
      {error && <div className="mt-5"><Alert message={error} /></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, count]) => (
          <div className="panel" key={label}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold">{count}</div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Recent event attendance</h2><p className="mt-1 text-xs text-slate-500">Updates automatically when attendance changes.</p></div><Link className="btn-secondary" to="/reports"><BarChart3 size={16} /> Open reports</Link></div>
        <div className="mt-4 divide-y">
          {snapshots.map(({ event, summary }) => {
            const rate = summary.expected ? Math.min(100, Math.round((summary.checkedIn / summary.expected) * 100)) : 0
            return <div className="py-4 first:pt-0 last:pb-0" key={event.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{event.name}</div><div className="text-xs text-slate-500">{formatManilaDate(event.start_at)} · {summary.checkedIn}/{summary.expected} checked in</div></div><div className="flex gap-2"><Link className="btn-secondary" to={`/reports?event=${event.id}`}><BarChart3 size={14} /> Report</Link>{event.status === 'open' && <Link className="btn-primary" to={`/events/${event.id}/scanner`}><ScanLine size={14} /> Scan</Link>}</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${rate}%` }} /></div></div>
          })}
          {!snapshots.length && <p className="py-6 text-center text-sm text-slate-500">No events available yet.</p>}
        </div>
      </section>
    </div>
  )
}
