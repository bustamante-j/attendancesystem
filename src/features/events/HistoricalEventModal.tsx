import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { createHistoricalEvent } from '../../services/events'
import { listStudents } from '../../services/students'
import type { AttendanceMode, Department, Student } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

type AttendanceStatus = 'present' | 'late'

interface HistoricalDraft {
  name: string
  description: string
  venue: string
  startAt: string
  endAt: string
  attendanceMode: AttendanceMode
  departmentIds: string[]
  yearLevels: number[]
}

function initialDraft(departmentId: string): HistoricalDraft {
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const start = new Date(end.getTime() - 4 * 60 * 60 * 1000)
  return {
    name: '',
    description: '',
    venue: '',
    startAt: toDateTimeLocal(start),
    endAt: toDateTimeLocal(end),
    attendanceMode: 'check_in_only',
    departmentIds: departmentId ? [departmentId] : [],
    yearLevels: [],
  }
}

function SplitDateTime({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [date = '', time = ''] = value.split('T')
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(7rem,0.75fr)]">
        <input
          className="field"
          type="date"
          aria-label={`${label} date`}
          value={date}
          onChange={(event) => onChange(event.target.value ? `${event.target.value}T${time || '00:00'}` : '')}
        />
        <input
          className="field"
          type="time"
          aria-label={`${label} time`}
          value={time}
          disabled={!date}
          onChange={(event) => onChange(date && event.target.value ? `${date}T${event.target.value}` : value)}
        />
      </div>
    </fieldset>
  )
}

/** Checkbox rendered as a selectable chip, matching the event form's audience picker. */
function ChipCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-base text-ink transition-colors hover:bg-sunken has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

export function HistoricalEventModal({ departments, onClose, onCreated }: {
  departments: Department[]
  onClose: () => void
  onCreated: (message: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => initialDraft(departments[0]?.id ?? ''))
  const [students, setStudents] = useState<Student[]>([])
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [step, setStep] = useState<1 | 2>(1)
  const [search, setSearch] = useState('')
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void listStudents()
      .then((rows) => { if (active) setStudents(rows) })
      .catch((cause) => { if (active) setError(friendlyError(cause, 'Students could not be loaded.')) })
      .finally(() => { if (active) setLoadingStudents(false) })
    return () => { active = false }
  }, [])

  const eligible = useMemo(() => students.filter((student) => student.is_active
    && draft.departmentIds.includes(student.department_id)
    && (!draft.yearLevels.length || draft.yearLevels.includes(student.year_level))), [draft.departmentIds, draft.yearLevels, students])
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? eligible.filter((student) => `${student.student_number} ${student.full_name} ${student.departments?.code ?? ''}`.toLowerCase().includes(needle)) : eligible
  }, [eligible, search])
  const selectedCount = eligible.reduce((count, student) => count + (attendance[student.id] ? 1 : 0), 0)
  const allVisibleSelected = Boolean(visible.length) && visible.every((student) => attendance[student.id])

  const update = <Key extends keyof HistoricalDraft>(key: Key, value: HistoricalDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const toggleValue = (key: 'departmentIds' | 'yearLevels', value: string | number) => {
    setDraft((current) => {
      const values = current[key] as Array<string | number>
      return { ...current, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] }
    })
  }
  const continueToRoster = () => {
    setError(null)
    try {
      if (!draft.name.trim()) throw new Error('Event name is required.')
      if (!draft.startAt || !draft.endAt) throw new Error('Enter the completed event schedule.')
      if (!draft.departmentIds.length) throw new Error('Select at least one department.')
      const start = new Date(manilaDateTimeToIso(draft.startAt))
      const end = new Date(manilaDateTimeToIso(draft.endAt))
      if (start > end) throw new Error('The event end must be after its start.')
      if (end > new Date()) throw new Error('A completed event must end in the past.')
      if (!eligible.length) throw new Error('No active students match this audience.')
      const eligibleIds = new Set(eligible.map((student) => student.id))
      setAttendance((current) => Object.fromEntries(Object.entries(current).filter(([id]) => eligibleIds.has(id))))
      setStep(2)
    } catch (cause) {
      setError(friendlyError(cause))
    }
  }
  const toggleStudent = (studentId: string) => {
    setAttendance((current) => {
      const next = { ...current }
      if (next[studentId]) delete next[studentId]
      else next[studentId] = 'present'
      return next
    })
  }
  const toggleVisible = () => {
    setAttendance((current) => {
      const next = { ...current }
      for (const student of visible) {
        if (allVisibleSelected) delete next[student.id]
        else next[student.id] = next[student.id] ?? 'present'
      }
      return next
    })
  }
  const save = async () => {
    if (!selectedCount) { setError('Select at least one student who attended.'); return }
    setSaving(true)
    setError(null)
    try {
      const result = await createHistoricalEvent({
        name: draft.name.trim(),
        description: draft.description.trim(),
        venue: draft.venue.trim(),
        start_at: manilaDateTimeToIso(draft.startAt),
        end_at: manilaDateTimeToIso(draft.endAt),
        attendance_mode: draft.attendanceMode,
        department_ids: draft.departmentIds,
        year_levels: draft.yearLevels,
        attendance: eligible.flatMap((student) => attendance[student.id] ? [{ student_id: student.id, status: attendance[student.id] }] : []),
      })
      await onCreated(`Completed event added with ${result.attendanceCount} attendee${result.attendanceCount === 1 ? '' : 's'} and ${Math.max(result.expectedCount - result.attendanceCount, 0)} absent.`)
    } catch (cause) {
      setError(friendlyError(cause, 'The completed event could not be added.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={step === 1 ? 'Add completed event' : 'Record attendance'}
      description={step === 1 ? 'Backfill an event that already happened.' : draft.name}
      onClose={onClose}
      size={step === 1 ? 'lg' : 'xl'}
      closeDisabled={saving}
    >
      <div className="space-y-5">
        <ol className="flex items-center gap-2 text-meta">
          <li className={`badge ${step === 1 ? 'badge-accent' : 'badge-ok'}`}>
            {step === 1 ? '1' : <CheckCircle2 size={12} />} Event details
          </li>
          <li aria-hidden="true" className="h-px w-4 bg-line" />
          <li className={`badge ${step === 2 ? 'badge-accent' : 'badge-neutral'}`}>2 Attendance roster</li>
        </ol>

        {error && <Alert message={error} />}

        {step === 1 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Event name</span>
                <input className="field" autoFocus value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Alumni General Assembly" />
              </label>
              <label className="block">
                <span className="label">Venue</span>
                <input className="field" value={draft.venue} onChange={(event) => update('venue', event.target.value)} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Description <span className="text-subtle">(optional)</span></span>
                <textarea className="field resize-y" rows={2} value={draft.description} onChange={(event) => update('description', event.target.value)} />
              </label>
              <SplitDateTime label="Event started" value={draft.startAt} onChange={(value) => update('startAt', value)} />
              <SplitDateTime label="Event ended" value={draft.endAt} onChange={(value) => update('endAt', value)} />
              <label className="block">
                <span className="label">Attendance mode</span>
                <select className="field" value={draft.attendanceMode} onChange={(event) => update('attendanceMode', event.target.value as AttendanceMode)}>
                  <option value="check_in_only">Check-in only</option>
                  <option value="check_in_out">Check-in and check-out</option>
                </select>
              </label>
            </div>

            <section className="border-t border-line pt-5">
              <h3 className="text-base font-medium text-ink">Expected audience</h3>
              <p className="mt-0.5 text-meta text-muted">Unselected students in this audience will appear as absent.</p>
              <fieldset className="mt-3">
                <legend className="label">Departments</legend>
                <div className="flex flex-wrap gap-2">
                  {departments.map((department) => (
                    <ChipCheckbox
                      key={department.id}
                      label={department.code}
                      checked={draft.departmentIds.includes(department.id)}
                      onChange={() => toggleValue('departmentIds', department.id)}
                    />
                  ))}
                </div>
              </fieldset>
              <fieldset className="mt-4">
                <legend className="label">Year levels <span className="text-subtle">(none means all)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4].map((year) => (
                    <ChipCheckbox
                      key={year}
                      label={`Year ${year}`}
                      checked={draft.yearLevels.includes(year)}
                      onChange={() => toggleValue('yearLevels', year)}
                    />
                  ))}
                </div>
              </fieldset>
            </section>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" disabled={loadingStudents} onClick={continueToRoster}>
                {loadingStudents
                  ? <><LoaderCircle size={15} className="animate-spin" /> Loading students…</>
                  : <>Continue to attendance <ArrowRight size={15} /></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <Alert tone="info" message="Check the students who attended and mark each Present or Late. Everyone else in the audience is reported Absent." />

            <div className="filter-bar justify-between">
              <label className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" size={16} />
                <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name or ID" />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-base text-muted">{selectedCount} of {eligible.length} attending</span>
                <button className="btn-secondary btn-sm" onClick={toggleVisible}>
                  {allVisibleSelected ? 'Clear visible' : 'Select visible'}
                </button>
              </div>
            </div>

            <div className="table-shell">
              <div className="max-h-[48vh] overflow-y-auto">
                <table>
                  <thead className="sticky top-0 z-[1]">
                    <tr>
                      <th className="w-10">Attend</th>
                      <th>Student</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((student) => {
                      const status = attendance[student.id]
                      return (
                        <tr key={student.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={Boolean(status)}
                              onChange={() => toggleStudent(student.id)}
                              aria-label={`Select ${student.full_name}`}
                            />
                          </td>
                          <td>
                            <div className="cell-title">{student.full_name}</div>
                            <div className="cell-meta font-mono">{student.student_number}</div>
                          </td>
                          <td>
                            <div className="text-ink">{student.departments?.code ?? '—'}</div>
                            <div className="cell-meta">Year {student.year_level}</div>
                          </td>
                          <td>
                            <select
                              className="field w-auto min-w-28"
                              value={status ?? 'present'}
                              disabled={!status}
                              aria-label={`Attendance status for ${student.full_name}`}
                              onChange={(event) => setAttendance((current) => ({ ...current, [student.id]: event.target.value as AttendanceStatus }))}
                            >
                              <option value="present">Present</option>
                              <option value="late">Late</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                    {!visible.length && (
                      <tr><td colSpan={4} className="py-10 text-center text-muted">No students match this search.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              <button className="btn-secondary" disabled={saving} onClick={() => { setStep(1); setError(null) }}>
                <ArrowLeft size={15} /> Back
              </button>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
                <button className="btn-primary" disabled={saving || !selectedCount} onClick={() => void save()}>
                  {saving ? <><LoaderCircle size={15} className="animate-spin" /> Saving…</> : 'Save completed event'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
