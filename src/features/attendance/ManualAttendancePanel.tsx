import { RotateCcw, Search, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { friendlyError } from '../../lib/errors'
import { processManualAttendance, searchEventStudents, undoLastManualAttendance, type AttendanceDirection } from '../../services/attendance'
import type { AttendanceResult, EventStudentSearchResult } from '../../types/app'

export function ManualAttendancePanel({ eventId, direction, onResult }: {
  eventId: string
  direction: AttendanceDirection
  onResult: (result: AttendanceResult, method: 'manual') => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<EventStudentSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [lastAction, setLastAction] = useState<{ attendanceId: string; studentId: string; fullName: string; direction: AttendanceDirection } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < 2) {
      setStudents([])
      setLoading(false)
      setError(null)
      return
    }

    let current = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      void searchEventStudents(eventId, normalized).then((rows) => {
        if (current) { setStudents(rows); setError(null) }
      }).catch((cause: unknown) => {
        if (current) setError(friendlyError(cause, 'Student search failed.'))
      }).finally(() => { if (current) setLoading(false) })
    }, 250)

    return () => { current = false; window.clearTimeout(timer) }
  }, [eventId, query])

  const processStudent = async (student: EventStudentSearchResult) => {
    setProcessingId(student.student_id)
    setError(null)
    try {
      const result = await processManualAttendance(eventId, student.student_id, direction)
      await onResult(result, 'manual')
      if (result.attendance?.id && ['success_present', 'success_late', 'success_checkout'].includes(result.code)) {
        setLastAction({ attendanceId: result.attendance.id, studentId: student.student_id, fullName: student.full_name, direction })
      }
      setStudents((current) => current.map((item) => item.student_id === student.student_id
        ? {
            ...item,
            check_in_at: result.attendance?.checkInAt ?? item.check_in_at,
            check_in_status: result.attendance?.checkInStatus ?? item.check_in_status,
            check_out_at: result.attendance?.checkOutAt ?? item.check_out_at,
          }
        : item))
    } catch (cause) {
      setError(friendlyError(cause, 'Attendance could not be recorded.'))
    } finally {
      setProcessingId(null)
    }
  }

  const undoLastAction = async () => {
    if (!lastAction) return
    setUndoing(true)
    setError(null)
    try {
      const result = await undoLastManualAttendance(eventId, lastAction.attendanceId, lastAction.direction)
      await onResult(result, 'manual')
      setStudents((current) => current.map((student) => student.student_id !== lastAction.studentId
        ? student
        : lastAction.direction === 'check_in'
          ? { ...student, check_in_at: null, check_in_status: null, check_out_at: null }
          : { ...student, check_out_at: null }))
      setLastAction(null)
    } catch (cause) {
      setError(friendlyError(cause, 'The last manual action could not be undone.'))
    } finally {
      setUndoing(false)
    }
  }

  return (
    <section className="panel">
      <div className="flex items-center gap-2">
        <UserCheck size={19} />
        <div>
          <h2 className="font-semibold">Manual attendance</h2>
          <p className="text-xs text-slate-500">Search eligible students by name or student ID.</p>
        </div>
      </div>
      {lastAction && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-950 dark:text-amber-100">Last manual action: <strong>{lastAction.direction === 'check_in' ? 'check-in' : 'check-out'} for {lastAction.fullName}</strong></p>
          <button className="btn-secondary" disabled={undoing} onClick={() => void undoLastAction()}><RotateCcw size={16} /> {undoing ? 'Undoing…' : 'Undo last action'}</button>
        </div>
      )}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
        <input
          aria-label="Search eligible students for manual attendance"
          className="field pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter at least 2 characters"
          autoComplete="off"
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="mt-3 text-sm text-slate-500">Searching…</p>}
      {!loading && query.trim().length >= 2 && !students.length && !error && <p className="mt-3 text-sm text-slate-500">No eligible students found.</p>}
      {!!students.length && (
        <div className="mt-4 divide-y rounded-lg border border-slate-200">
          {students.map((student) => {
            const disabled = direction === 'check_in'
              ? !!student.check_in_at
              : !student.check_in_at || !!student.check_out_at
            const status = student.check_out_at
              ? 'Checked out'
              : student.check_in_at
                ? student.check_in_status === 'late' ? 'Late' : 'Checked in'
                : 'Not checked in'
            return (
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between" key={student.student_id}>
                <div className="min-w-0">
                  <div className="font-medium">{student.full_name}</div>
                  <div className="text-xs text-slate-500">{student.student_number} · {student.department_code} · Year {student.year_level}</div>
                  <div className="mt-1 text-xs font-medium text-slate-600">{status}</div>
                </div>
                <button
                  className="btn-secondary shrink-0"
                  disabled={disabled || processingId === student.student_id}
                  onClick={() => void processStudent(student)}
                >
                  {processingId === student.student_id ? 'Processing…' : direction === 'check_in' ? 'Check in' : 'Check out'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
