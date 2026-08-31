import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/Alert'
import { LoadingScreen } from '../../components/LoadingScreen'
import { Modal } from '../../components/Modal'
import { StatusBadge, type StatusTone } from '../../components/StatusBadge'
import { friendlyError } from '../../lib/errors'
import { getStudentAttendanceHistory } from '../../services/reports'
import type { AttendanceReportStatus, Student, StudentAttendanceHistoryRow } from '../../types/app'
import { formatManilaDate } from '../../utils/dates'

const statusTone: Record<AttendanceReportStatus, StatusTone> = { present: 'ok', late: 'warn', absent: 'neutral' }

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

  const counts = useMemo(() => ([
    ['Events', rows.length],
    ['Present', rows.filter((row) => row.attendance_status === 'present').length],
    ['Late', rows.filter((row) => row.attendance_status === 'late').length],
    ['Absent', rows.filter((row) => row.attendance_status === 'absent').length],
  ] as const), [rows])

  return (
    <Modal title="Attendance history" description={`${student.full_name} · ${student.student_number}`} onClose={onClose} size="xl">
      {loading ? <LoadingScreen label="Loading attendance history…" /> : (
        <div className="space-y-4">
          {error && <Alert message={error} />}

          <div className="stat-strip grid-cols-2 sm:grid-cols-4">
            {counts.map(([label, count]) => (
              <div className="stat" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value text-2xl">{count}</div>
              </div>
            ))}
          </div>

          <div className="table-shell">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.event_id}>
                      <td>
                        <div className="cell-title">{row.event_name}</div>
                        <div className="cell-meta capitalize">{row.event_status}</div>
                      </td>
                      <td className="whitespace-nowrap text-muted">{formatManilaDate(row.event_start_at)}</td>
                      <td><StatusBadge tone={statusTone[row.attendance_status]}>{row.attendance_status}</StatusBadge></td>
                      <td className="whitespace-nowrap">
                        {row.check_in_at ? (
                          <>
                            <div className="text-ink">{formatManilaDate(row.check_in_at)}</div>
                            <div className="cell-meta uppercase">{row.check_in_method}</div>
                          </>
                        ) : <span className="text-subtle">—</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {row.check_out_at ? (
                          <>
                            <div className="text-ink">{formatManilaDate(row.check_out_at)}</div>
                            <div className="cell-meta uppercase">{row.check_out_method}</div>
                          </>
                        ) : <span className="text-subtle">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td className="py-10 text-center text-muted" colSpan={5}>No completed-event attendance history yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
