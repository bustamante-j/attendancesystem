import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/Alert'
import { LoadingScreen } from '../../components/LoadingScreen'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { getStudentAttendanceHistory } from '../../services/reports'
import type { Student, StudentAttendanceHistoryRow } from '../../types/app'
import { formatManilaDate } from '../../utils/dates'

function statusStyle(status: StudentAttendanceHistoryRow['attendance_status']) {
  if (status === 'present') return 'bg-emerald-100 text-emerald-800'
  if (status === 'late') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-200 text-slate-700'
}

export type StudentHistoryTarget = Pick<Student, 'id' | 'student_number' | 'full_name'>

export function StudentHistoryModal({ student, onClose }: { student: StudentHistoryTarget; onClose: () => void }) {
  const [rows, setRows] = useState<StudentAttendanceHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void getStudentAttendanceHistory(student.id).then((data) => {
      if (current) setRows(data)
    }).catch((cause: unknown) => {
      if (current) setError(friendlyError(cause, 'Student history could not be loaded.'))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [student.id])

  const counts = useMemo(() => ({
    events: rows.length,
    present: rows.filter((row) => row.attendance_status === 'present').length,
    late: rows.filter((row) => row.attendance_status === 'late').length,
    absent: rows.filter((row) => row.attendance_status === 'absent').length,
  }), [rows])

  return (
    <Modal title={`Attendance history · ${student.full_name}`} onClose={onClose} size="xl">
      {loading ? <LoadingScreen label="Loading attendance history…" /> : (
        <div className="space-y-4">
          {error && <Alert message={error} />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Events', counts.events], ['Present', counts.present], ['Late', counts.late], ['Absent', counts.absent]].map(([label, count]) => (
              <div className="rounded-lg border border-slate-200 p-3" key={label}><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold">{count}</div></div>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Event</th><th>Schedule</th><th>Status</th><th>Check-in</th><th>Check-out</th></tr></thead>
              <tbody>
                {rows.map((row) => <tr key={row.event_id}><td><div className="font-medium">{row.event_name}</div><div className="text-xs capitalize text-slate-500">{row.event_status}</div></td><td>{formatManilaDate(row.event_start_at)}</td><td><span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusStyle(row.attendance_status)}`}>{row.attendance_status}</span></td><td>{row.check_in_at ? <>{formatManilaDate(row.check_in_at)}<div className="text-xs uppercase text-slate-500">{row.check_in_method}</div></> : '—'}</td><td>{row.check_out_at ? <>{formatManilaDate(row.check_out_at)}<div className="text-xs uppercase text-slate-500">{row.check_out_method}</div></> : '—'}</td></tr>)}
                {!rows.length && <tr><td className="py-10 text-center text-slate-500" colSpan={5}>No completed-event attendance history yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
