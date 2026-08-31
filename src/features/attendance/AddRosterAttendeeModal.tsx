import { Search, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { addEventGuestAttendance, setEventRosterAttendance } from '../../services/eventRoster'
import { listStudents } from '../../services/students'
import type { EventRecord, Student } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

type AttendeeMode = 'registered' | 'temporary'

function defaultRecordedAt(eventRecord: EventRecord) {
  return toDateTimeLocal(eventRecord.status === 'closed' ? eventRecord.start_at : new Date())
}

export function AddRosterAttendeeModal({ eventRecord, existingStudentIds, onClose, onSaved }: {
  eventRecord: EventRecord
  existingStudentIds: Set<string>
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const [mode, setMode] = useState<AttendeeMode>('registered')
  const [students, setStudents] = useState<Student[]>([])
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [fullName, setFullName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [affiliation, setAffiliation] = useState('')
  const [status, setStatus] = useState<'present' | 'late'>('present')
  const [recordedAt, setRecordedAt] = useState(() => defaultRecordedAt(eventRecord))
  const [remarks, setRemarks] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void listStudents().then((rows) => {
      if (current) setStudents(rows.filter((student) => student.is_active))
    }).catch((cause: unknown) => {
      if (current) setError(friendlyError(cause, 'Students could not be loaded.'))
    }).finally(() => { if (current) setLoadingStudents(false) })
    return () => { current = false }
  }, [])

  const matches = useMemo(() => {
    const needle = studentSearch.trim().toLowerCase()
    if (needle.length < 2) return []
    return students
      .filter((student) => !existingStudentIds.has(student.id))
      .filter((student) => `${student.student_number} ${student.full_name} ${student.departments?.code ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 12)
  }, [existingStudentIds, studentSearch, students])

  const save = async () => {
    if (mode === 'registered' && !selectedStudent) {
      setError('Select a registered student first.')
      return
    }
    if (mode === 'temporary' && !fullName.trim()) {
      setError('Enter the temporary attendee’s name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const recordedAtIso = manilaDateTimeToIso(recordedAt)
      if (mode === 'registered' && selectedStudent) {
        await setEventRosterAttendance({
          eventId: eventRecord.id,
          studentIds: [selectedStudent.id],
          status,
          recordedAt: recordedAtIso,
          preserveCheckOut: false,
          remarks,
          preserveRemarks: false,
        })
        await onSaved(`${selectedStudent.full_name} was added to the event roster.`)
      } else {
        await addEventGuestAttendance(eventRecord.id, {
          fullName,
          referenceNumber,
          affiliation,
          status,
          recordedAt: recordedAtIso,
          remarks,
        })
        await onSaved(`${fullName.trim()} was added as a temporary attendee.`)
      }
    } catch (cause) {
      setError(friendlyError(cause, 'The attendee could not be added.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add attendee" onClose={onClose} size="lg" closeDisabled={busy}>
      <div className="space-y-5">
        <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto dark:border-slate-700 dark:bg-slate-800">
          <button className={`attendee-mode-button ${mode === 'registered' ? 'attendee-mode-button-active' : ''}`} onClick={() => setMode('registered')} type="button"><UsersRound size={16} /> Registered student</button>
          <button className={`attendee-mode-button ${mode === 'temporary' ? 'attendee-mode-button-active' : ''}`} onClick={() => setMode('temporary')} type="button"><UserPlus size={16} /> Temporary attendee</button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200">{error}</div>}

        {mode === 'registered' ? (
          <section className="space-y-3">
            <div>
              <label className="label" htmlFor="roster-student-search">Find a registered student</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-3 text-slate-400" size={18} />
                <input
                  autoComplete="off"
                  className="field pl-10"
                  id="roster-student-search"
                  placeholder="Type at least 2 characters of a name or ID"
                  value={studentSearch}
                  onChange={(inputEvent) => { setStudentSearch(inputEvent.target.value); setSelectedStudent(null) }}
                />
              </div>
            </div>
            {loadingStudents ? <p className="text-sm text-slate-500">Loading students…</p> : matches.length > 0 ? (
              <div className="max-h-64 divide-y overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {matches.map((student) => (
                  <button
                    className={`flex w-full items-center justify-between gap-4 p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 ${selectedStudent?.id === student.id ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    type="button"
                  >
                    <span><span className="block font-medium">{student.full_name}</span><span className="text-xs text-slate-500">{student.student_number} · {student.departments?.code ?? 'Unknown'} · Year {student.year_level}</span></span>
                    {selectedStudent?.id === student.id && <span className="status-chip bg-blue-100 text-blue-800">Selected</span>}
                  </button>
                ))}
              </div>
            ) : studentSearch.trim().length >= 2 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">No unlisted registered students match this search. Expected students are already included in the roster.</p>
            ) : (
              <p className="text-xs text-slate-500">Use this option for a registered student outside the event’s expected audience.</p>
            )}
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Full name</span><input className="field" maxLength={200} value={fullName} onChange={(inputEvent) => setFullName(inputEvent.target.value)} /></label>
            <label><span className="label">ID or reference number <span className="font-normal text-slate-400">(optional)</span></span><input className="field" maxLength={80} value={referenceNumber} onChange={(inputEvent) => setReferenceNumber(inputEvent.target.value)} /></label>
            <label><span className="label">Affiliation <span className="font-normal text-slate-400">(optional)</span></span><input className="field" maxLength={200} placeholder="Organization or department" value={affiliation} onChange={(inputEvent) => setAffiliation(inputEvent.target.value)} /></label>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Temporary attendees appear only in this event and are not added to the permanent student database.</p>
          </section>
        )}

        <section className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
          <label><span className="label">Attendance status</span><select className="field" value={status} onChange={(inputEvent) => setStatus(inputEvent.target.value as 'present' | 'late')}><option value="present">Present</option><option value="late">Late</option></select></label>
          <label><span className="label">Recorded time (Asia/Manila)</span><input className="field" type="datetime-local" value={recordedAt} onChange={(inputEvent) => setRecordedAt(inputEvent.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">Remarks <span className="font-normal text-slate-400">(optional)</span></span><textarea className="field min-h-24 resize-y" maxLength={500} value={remarks} onChange={(inputEvent) => setRemarks(inputEvent.target.value)} /></label>
        </section>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !recordedAt || (mode === 'registered' ? !selectedStudent : !fullName.trim())} onClick={() => void save()}>{busy ? 'Adding…' : 'Add to roster'}</button>
        </div>
      </div>
    </Modal>
  )
}
