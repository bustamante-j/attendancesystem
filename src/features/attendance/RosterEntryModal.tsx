import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { useConfirm } from '../../components/ConfirmDialog'
import { friendlyError } from '../../lib/errors'
import {
  removeEventGuestAttendance,
  setEventRosterAttendance,
  updateEventGuestAttendance,
} from '../../services/eventRoster'
import type { AttendanceReportStatus, EventGuestAttendance, EventRecord, EventRosterStudentRow } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

export type RosterEditTarget =
  | { kind: 'student'; row: EventRosterStudentRow }
  | { kind: 'guest'; row: EventGuestAttendance }

function targetTime(target: RosterEditTarget, eventRecord: EventRecord) {
  const value = target.kind === 'student' ? target.row.check_in_at : target.row.recorded_at
  return toDateTimeLocal(value ?? (eventRecord.status === 'closed' ? eventRecord.start_at : new Date()))
}

export function RosterEntryModal({ eventRecord, target, onClose, onSaved }: {
  eventRecord: EventRecord
  target: RosterEditTarget
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const confirm = useConfirm()
  const [fullName, setFullName] = useState(target.row.full_name)
  const [referenceNumber, setReferenceNumber] = useState(target.kind === 'guest' ? target.row.reference_number ?? '' : '')
  const [affiliation, setAffiliation] = useState(target.kind === 'guest' ? target.row.affiliation ?? '' : '')
  const [status, setStatus] = useState<AttendanceReportStatus>(target.row.attendance_status)
  const [recordedAt, setRecordedAt] = useState(() => targetTime(target, eventRecord))
  const [checkOutAt, setCheckOutAt] = useState(target.kind === 'student' && target.row.check_out_at ? toDateTimeLocal(target.row.check_out_at) : '')
  const [remarks, setRemarks] = useState(target.row.remarks ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const recordedAtIso = manilaDateTimeToIso(recordedAt)
      if (target.kind === 'student') {
        const checkOutIso = status !== 'absent' && checkOutAt ? manilaDateTimeToIso(checkOutAt) : null
        if (checkOutIso && new Date(checkOutIso) < new Date(recordedAtIso)) throw new Error('Check-out cannot be earlier than check-in.')
        await setEventRosterAttendance({
          eventId: eventRecord.id,
          studentIds: [target.row.student_id],
          status,
          recordedAt: recordedAtIso,
          checkOutAt: checkOutIso,
          preserveCheckOut: false,
          remarks,
          preserveRemarks: false,
        })
        await onSaved(`${target.row.full_name}’s attendance was updated.`)
      } else {
        if (status === 'absent') throw new Error('Remove a temporary attendee instead of marking them absent.')
        await updateEventGuestAttendance(target.row.id, {
          fullName,
          referenceNumber,
          affiliation,
          status,
          recordedAt: recordedAtIso,
          remarks,
        })
        await onSaved(`${fullName.trim()}’s temporary attendance was updated.`)
      }
    } catch (cause) {
      setError(friendlyError(cause, 'The roster entry could not be updated.'))
    } finally {
      setBusy(false)
    }
  }

  const removeGuest = async () => {
    if (target.kind !== 'guest' || !await confirm({
      title: 'Remove temporary attendee?',
      message: `${target.row.full_name} will be removed from this event roster. You can undo this as the latest roster change.`,
      confirmLabel: 'Remove attendee',
      tone: 'danger',
    })) return
    setBusy(true)
    setError(null)
    try {
      await removeEventGuestAttendance(target.row.id)
      await onSaved(`${target.row.full_name} was removed from the event roster.`)
    } catch (cause) {
      setError(friendlyError(cause, 'The temporary attendee could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Edit attendance"
      description={target.kind === 'student'
        ? `${target.row.full_name} · ${target.row.student_number} · ${target.row.department_code} Year ${target.row.year_level}`
        : `${target.row.full_name} · Temporary attendee`}
      onClose={onClose}
      size="md"
      closeDisabled={busy}
    >
      <div className="space-y-4">
        {error && <Alert message={error} />}

        {target.kind === 'student' ? (
          <p className="rounded-lg border border-line bg-sunken px-3 py-2.5 text-meta text-muted">
            Original method: {target.row.check_in_method?.toUpperCase() ?? 'no attendance record'}. Saving records the entry as manual.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">Full name</span>
              <input className="field" maxLength={200} value={fullName} onChange={(inputEvent) => setFullName(inputEvent.target.value)} />
            </label>
            <label className="block">
              <span className="label">ID or reference</span>
              <input className="field" maxLength={80} value={referenceNumber} onChange={(inputEvent) => setReferenceNumber(inputEvent.target.value)} />
            </label>
            <label className="block">
              <span className="label">Affiliation</span>
              <input className="field" maxLength={200} value={affiliation} onChange={(inputEvent) => setAffiliation(inputEvent.target.value)} />
            </label>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Status</span>
            <select className="field" value={status} onChange={(inputEvent) => setStatus(inputEvent.target.value as AttendanceReportStatus)}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              {target.kind === 'student' && <option value="absent">Absent</option>}
            </select>
          </label>
          {status !== 'absent' && (
            <label className="block">
              <span className="label">Recorded time</span>
              <input className="field" type="datetime-local" value={recordedAt} onChange={(inputEvent) => setRecordedAt(inputEvent.target.value)} />
            </label>
          )}
          {target.kind === 'student' && status !== 'absent' && eventRecord.attendance_mode === 'check_in_out' && (
            <label className="block sm:col-span-2">
              <span className="label">Check-out time <span className="text-subtle">(optional)</span></span>
              <input className="field" type="datetime-local" value={checkOutAt} onChange={(inputEvent) => setCheckOutAt(inputEvent.target.value)} />
            </label>
          )}
          <label className="block sm:col-span-2">
            <span className="label">Remarks or correction reason <span className="text-subtle">(optional)</span></span>
            <textarea className="field min-h-20 resize-y" maxLength={500} value={remarks} onChange={(inputEvent) => setRemarks(inputEvent.target.value)} />
          </label>
        </div>

        <p className="text-meta text-muted">
          Recorded in the activity log. Reversible with “Undo latest change” while it remains the most recent roster action.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          {target.kind === 'guest' ? (
            <button className="btn-ghost text-bad-ink hover:bg-bad-soft" disabled={busy} onClick={() => void removeGuest()}>
              <Trash2 size={15} /> Remove
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              disabled={busy || !recordedAt || (target.kind === 'guest' && !fullName.trim())}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
