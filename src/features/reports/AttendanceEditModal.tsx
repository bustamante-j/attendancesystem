import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { correctAttendance, removeAttendance } from '../../services/reports'
import type { AttendanceReportRow, EventRecord } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

export function AttendanceEditModal({ eventRecord, row, onClose, onSaved }: {
  eventRecord: EventRecord
  row: AttendanceReportRow
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [checkInAt, setCheckInAt] = useState(toDateTimeLocal(row.check_in_at ?? eventRecord.start_at))
  const [status, setStatus] = useState<'present' | 'late'>(row.attendance_status === 'late' ? 'late' : 'present')
  const [checkOutAt, setCheckOutAt] = useState(row.check_out_at ? toDateTimeLocal(row.check_out_at) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const checkInIso = manilaDateTimeToIso(checkInAt)
      const checkOutIso = checkOutAt ? manilaDateTimeToIso(checkOutAt) : null
      if (checkOutIso && new Date(checkOutIso) < new Date(checkInIso)) {
        throw new Error('Check-out cannot be earlier than check-in.')
      }
      await correctAttendance({
        eventId: eventRecord.id,
        studentId: row.student_id,
        checkInAt: checkInIso,
        checkInStatus: status,
        checkOutAt: checkOutIso,
      })
      await onSaved(`Attendance corrected for ${row.full_name}.`)
    } catch (cause) {
      setError(friendlyError(cause, 'Attendance could not be corrected.'))
    } finally {
      setBusy(false)
    }
  }

  const markAbsent = async () => {
    if (!row.check_in_at || !window.confirm(`Remove ${row.full_name}'s attendance record and mark them absent?`)) return
    setBusy(true)
    setError(null)
    try {
      await removeAttendance(eventRecord.id, row.student_id)
      await onSaved(`${row.full_name} is now marked absent.`)
    } catch (cause) {
      setError(friendlyError(cause, 'Attendance could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Correct attendance · ${row.full_name}`} onClose={onClose} size="md" closeDisabled={busy}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-medium">{row.student_number}</div>
          <div className="text-slate-500">{row.department_code} · Year {row.year_level}</div>
        </div>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <label className="block">
          <span className="label">Check-in time (Asia/Manila)</span>
          <input className="field" type="datetime-local" value={checkInAt} onChange={(event) => setCheckInAt(event.target.value)} />
        </label>
        <label className="block">
          <span className="label">Check-in status</span>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as 'present' | 'late')}>
            <option value="present">Present</option>
            <option value="late">Late</option>
          </select>
        </label>
        {eventRecord.attendance_mode === 'check_in_out' && (
          <label className="block">
            <span className="label">Check-out time (optional)</span>
            <input className="field" type="datetime-local" value={checkOutAt} onChange={(event) => setCheckOutAt(event.target.value)} />
          </label>
        )}
        <p className="text-xs text-slate-500">Corrections are recorded as manual attendance and written to the audit log.</p>
        <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
          <button className="btn-danger" disabled={busy || !row.check_in_at} onClick={() => void markAbsent()}>Mark absent</button>
          <div className="flex gap-3">
            <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy || !checkInAt} onClick={() => void save()}>{busy ? 'Saving…' : row.check_in_at ? 'Save correction' : 'Add attendance'}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
