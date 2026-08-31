import { Search, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { SegmentedControl } from '../../components/SegmentedControl'
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
    <Modal title="Add attendee" description={eventRecord.name} onClose={onClose} size="lg" closeDisabled={busy}>
      <div className="space-y-5">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          label="Attendee type"
          options={[
            { value: 'registered', label: 'Registered student', icon: UsersRound },
            { value: 'temporary', label: 'Temporary attendee', icon: UserPlus },
          ]}
        />

        {error && <Alert message={error} />}

        {mode === 'registered' ? (
          <section className="space-y-3">
            <div>
              <label className="label" htmlFor="roster-student-search">Find a registered student</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" size={16} />
                <input
                  autoComplete="off"
                  className="field pl-9"
                  id="roster-student-search"
                  placeholder="Type at least 2 characters of a name or ID"
                  value={studentSearch}
                  onChange={(inputEvent) => { setStudentSearch(inputEvent.target.value); setSelectedStudent(null) }}
                />
              </div>
            </div>
            {loadingStudents ? <p className="text-base text-muted">Loading students…</p> : matches.length > 0 ? (
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {matches.map((student) => (
                  <li key={student.id}>
                    <button
                      className={`flex w-full items-center justify-between gap-4 px-3.5 py-2.5 text-left transition-colors hover:bg-sunken ${
                        selectedStudent?.id === student.id ? 'bg-accent-soft' : ''
                      }`}
                      onClick={() => setSelectedStudent(student)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base text-ink">{student.full_name}</span>
                        <span className="cell-meta block">
                          {student.student_number} · {student.departments?.code ?? 'Unknown'} · Year {student.year_level}
                        </span>
                      </span>
                      {selectedStudent?.id === student.id && <span className="badge badge-accent shrink-0">Selected</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : studentSearch.trim().length >= 2 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-base text-muted">
                No unlisted registered students match. Expected students are already in the roster.
              </p>
            ) : (
              <p className="text-meta text-muted">For a registered student outside the event’s expected audience.</p>
            )}
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">Full name</span>
              <input className="field" maxLength={200} value={fullName} onChange={(inputEvent) => setFullName(inputEvent.target.value)} />
            </label>
            <label className="block">
              <span className="label">ID or reference <span className="text-subtle">(optional)</span></span>
              <input className="field" maxLength={80} value={referenceNumber} onChange={(inputEvent) => setReferenceNumber(inputEvent.target.value)} />
            </label>
            <label className="block">
              <span className="label">Affiliation <span className="text-subtle">(optional)</span></span>
              <input className="field" maxLength={200} placeholder="Organization or department" value={affiliation} onChange={(inputEvent) => setAffiliation(inputEvent.target.value)} />
            </label>
            <p className="text-meta text-muted sm:col-span-2">
              Temporary attendees appear only in this event and are never added to the permanent student database.
            </p>
          </section>
        )}

        <section className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Attendance status</span>
            <select className="field" value={status} onChange={(inputEvent) => setStatus(inputEvent.target.value as 'present' | 'late')}>
              <option value="present">Present</option>
              <option value="late">Late</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Recorded time</span>
            <input className="field" type="datetime-local" value={recordedAt} onChange={(inputEvent) => setRecordedAt(inputEvent.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Remarks <span className="text-subtle">(optional)</span></span>
            <textarea className="field min-h-20 resize-y" maxLength={500} value={remarks} onChange={(inputEvent) => setRemarks(inputEvent.target.value)} />
          </label>
        </section>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={busy || !recordedAt || (mode === 'registered' ? !selectedStudent : !fullName.trim())}
            onClick={() => void save()}
          >
            {busy ? 'Adding…' : 'Add to roster'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
