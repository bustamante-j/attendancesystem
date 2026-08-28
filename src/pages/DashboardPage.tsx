import { useEffect, useState } from 'react'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { supabase } from '../lib/supabase'

interface Counts { students: number; departments: number; events: number; users: number }

export function DashboardPage() {
  const { profile } = useAuth()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const queries = await Promise.all([
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
          supabase.from('departments').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase.from('events').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          profile?.role === 'super_admin'
            ? supabase.from('profiles').select('id', { count: 'exact', head: true })
            : Promise.resolve({ count: 0, error: null }),
        ])
        const failed = queries.find((query) => query.error)
        if (failed?.error) throw failed.error
        setCounts({
          students: queries[0].count ?? 0,
          departments: queries[1].count ?? 0,
          events: queries[2].count ?? 0,
          users: queries[3].count ?? 0,
        })
      } catch (cause) {
        setError(friendlyError(cause))
      }
    }
    void load()
  }, [profile?.role])

  if (!counts && !error) return <LoadingScreen />
  const cards = [
    ['Active Students', counts?.students ?? 0],
    ['Departments', counts?.departments ?? 0],
    ['Events', counts?.events ?? 0],
    ...(profile?.role === 'super_admin' ? [['Users', counts?.users ?? 0] as [string, number]] : []),
  ]
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Backend verification overview</p>
      {error && <div className="mt-5"><Alert message={error} /></div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, count]) => (
          <div className="panel" key={label}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-3xl font-bold">{count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
