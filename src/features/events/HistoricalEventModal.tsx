import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Search, Users } from 'lucide-react'
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
  return <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <div className="mt-1 grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)]">
      <label><span className="label text-xs">Date</span><input className="field" type="date" value={date} onChange={(event) => onChange(event.target.value ? `${event.target.value}T${time || '00:00'}` : '')} /></label>
      <label><span className="label text-xs">Time</span><input className="field" type="time" value={time} disabled={!date} onChange={(event) => onChange(date && event.target.value ? `${date}T${event.target.value}` : value)} /></label>
    </div>
  </fieldset>
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

  return <Modal title={step === 1 ? 'Add completed event' : `Record attendance · ${draft.name}`} onClose={onClose} size={step === 1 ? 'lg' : 'xl'} closeDisabled={saving}>
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm">
        <span className={`status-chip ${step === 1 ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>{step === 1 ? '1' : <CheckCircle2 size={14} />} Event details</span>
        <span className={`status-chip ${step === 2 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>2 Attendance roster</span>
      </div>
      {error && <Alert message={error} />}

      {step === 1 ? <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Event name</span><input className="field" autoFocus value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Alumni General Assembly" /></label>
          <label><span className="label">Venue</span><input className="field" value={draft.venue} onChange={(event) => update('venue', event.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">Description <span className="font-normal text-slate-400">(optional)</span></span><textarea className="field" rows={2} value={draft.description} onChange={(event) => update('description', event.target.value)} /></label>
          <SplitDateTime label="Event started" value={draft.startAt} onChange={(value) => update('startAt', value)} />
          <SplitDateTime label="Event ended" value={draft.endAt} onChange={(value) => update('endAt', value)} />
          <label><span className="label">Attendance mode</span><select className="field" value={draft.attendanceMode} onChange={(event) => update('attendanceMode', event.target.value as AttendanceMode)}><option value="check_in_only">Check-in only</option><option value="check_in_out">Check-in and check-out</option></select></label>
        </div>
        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-3 flex items-center gap-2"><Users size={18} className="text-blue-600" /><div><h3 className="font-semibold">Expected audience</h3><p className="text-xs text-slate-500">Unselected students in this audience will appear as absent.</p></div></div>
          <fieldset><legend className="label">Departments</legend><div className="flex flex-wrap gap-2">{departments.map((department) => <label key={department.id} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700"><input type="checkbox" checked={draft.departmentIds.includes(department.id)} onChange={() => toggleValue('departmentIds', department.id)} /> {department.code}</label>)}</div></fieldset>
          <fieldset className="mt-4"><legend className="label">Year levels <span className="font-normal text-slate-500">(none means all)</span></legend><div className="flex flex-wrap gap-2">{[1, 2, 3, 4].map((year) => <label key={year} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm dark:border-slate-700"><input type="checkbox" checked={draft.yearLevels.includes(year)} onChange={() => toggleValue('yearLevels', year)} /> Year {year}</label>)}</div></fieldset>
        </section>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={loadingStudents} onClick={continueToRoster}>{loadingStudents ? <><LoaderCircle size={16} className="animate-spin" /> Loading students…</> : <>Continue to attendance <ArrowRight size={16} /></>}</button></div>
      </> : <>
        <Alert tone="info" message="Check the students who attended and mark each as Present or Late. Everyone else in the selected audience will be reported as Absent." />
        <div className="toolbar justify-between">
          <label className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="field pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name or ID" /></label>
          <div className="flex items-center gap-3"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedCount} of {eligible.length} attending</span><button className="btn-secondary" onClick={toggleVisible}>{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button></div>
        </div>
        <div className="table-wrap max-h-[48vh] overflow-y-auto"><table><thead className="sticky top-0 z-[1]"><tr><th className="w-12">Attend</th><th>Student</th><th>Department</th><th>Year</th><th>Status</th></tr></thead><tbody>{visible.map((student) => { const status = attendance[student.id]; return <tr key={student.id}><td><input type="checkbox" checked={Boolean(status)} onChange={() => toggleStudent(student.id)} aria-label={`Select ${student.full_name}`} /></td><td><div className="font-medium">{student.full_name}</div><div className="text-xs font-mono text-slate-500">{student.student_number}</div></td><td>{student.departments?.code ?? '—'}</td><td>Year {student.year_level}</td><td><select className="field min-w-32" value={status ?? 'present'} disabled={!status} aria-label={`Attendance status for ${student.full_name}`} onChange={(event) => setAttendance((current) => ({ ...current, [student.id]: event.target.value as AttendanceStatus }))}><option value="present">Present</option><option value="late">Late</option></select></td></tr>})}{!visible.length && <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-500">No students match this search.</td></tr>}</tbody></table></div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><button className="btn-secondary" disabled={saving} onClick={() => { setStep(1); setError(null) }}><ArrowLeft size={16} /> Back</button><div className="flex gap-3"><button className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={saving || !selectedCount} onClick={() => void save()}>{saving ? <><LoaderCircle size={16} className="animate-spin" /> Saving…</> : 'Save completed event'}</button></div></div>
      </>}
    </div>
  </Modal>
}
