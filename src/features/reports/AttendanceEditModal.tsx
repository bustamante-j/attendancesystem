import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { useConfirm } from '../../components/ConfirmDialog'
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
  const confirm = useConfirm()
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
    if (!row.check_in_at || !await confirm({ title: 'Mark student absent?', message: `${row.full_name}'s attendance record will be removed from this event.`, confirmLabel: 'Mark absent', tone: 'danger' })) return
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
    <Modal
      title="Correct attendance"
      description={`${row.full_name} · ${row.student_number} · ${row.department_code} Year ${row.year_level}`}
      onClose={onClose}
      size="sm"
      closeDisabled={busy}
    >
      <div className="space-y-4">
        {error && <Alert message={error} />}
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
        <p className="text-meta text-muted">Corrections are recorded as manual attendance and written to the activity log.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <button className="btn-ghost text-bad-ink hover:bg-bad-soft" disabled={busy || !row.check_in_at} onClick={() => void markAbsent()}>
            Mark absent
          </button>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={busy || !checkInAt} onClick={() => void save()}>
              {busy ? 'Saving…' : row.check_in_at ? 'Save correction' : 'Add attendance'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
