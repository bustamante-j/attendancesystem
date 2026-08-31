import {
  ArrowUpDown,
  Check,
  Clock3,
  Download,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  SearchX,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { AddRosterAttendeeModal } from '../features/attendance/AddRosterAttendeeModal'
import { exportEventRoster } from '../features/attendance/exportEventRoster'
import { RosterEntryModal, type RosterEditTarget } from '../features/attendance/RosterEntryModal'
import { useAuth } from '../features/auth/AuthProvider'
import { EventWorkspaceNav } from '../features/events/EventWorkspaceNav'
import { friendlyError } from '../lib/errors'
import {
  getEventAttendanceRoster,
  listEventGuestAttendance,
  setEventAttendanceFinalized,
  setEventRosterAttendance,
  subscribeToEventRoster,
  undoLastEventRosterChange,
} from '../services/eventRoster'
import { getEvent } from '../services/events'
import type {
  AttendanceReportStatus,
  EventGuestAttendance,
  EventRecord,
  EventRosterStudentRow,
} from '../types/app'
import { formatManilaDate } from '../utils/dates'

const PAGE_SIZE = 50
type SortField = 'name' | 'identity' | 'department' | 'year' | 'status' | 'time' | 'method'

type DisplayRosterRow =
  | { key: string; kind: 'student'; row: EventRosterStudentRow }
  | { key: string; kind: 'guest'; row: EventGuestAttendance }

function statusStyle(status: AttendanceReportStatus) {
  if (status === 'present') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
  if (status === 'late') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
  return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function EventMetric({ label, value, tone = 'slate', icon: Icon }: {
  label: string
  value: number
  tone?: 'slate' | 'green' | 'amber' | 'blue'
  icon: typeof UsersRound
}) {
  const colors = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
  }
  return (
    <div className="roster-metric">
      <div><div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value.toLocaleString()}</div></div>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}><Icon size={20} /></span>
    </div>
  )
}

export function EventAttendancePage() {
  const { eventId } = useParams()
  const { profile } = useAuth()
  const confirm = useConfirm()
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null)
  const [students, setStudents] = useState<EventRosterStudentRow[]>([])
  const [guests, setGuests] = useState<EventGuestAttendance[]>([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [sex, setSex] = useState('all')
  const [status, setStatus] = useState('all')
  const [attendeeType, setAttendeeType] = useState('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<RosterEditTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' | 'info' } | null>(null)
  const requestRef = useRef(0)

  const refreshRoster = useCallback(async (showLoading = false) => {
    if (!eventId) return
    const requestId = ++requestRef.current
    if (showLoading) setRefreshing(true)
    try {
      const [nextStudents, nextGuests] = await Promise.all([
        getEventAttendanceRoster(eventId),
        listEventGuestAttendance(eventId),
      ])
      if (requestId !== requestRef.current) return
      setStudents(nextStudents)
      setGuests(nextGuests)
      setSelectedStudentIds((current) => {
        const available = new Set(nextStudents.map((row) => row.student_id))
        return new Set([...current].filter((id) => available.has(id)))
      })
      setLastUpdated(new Date())
    } catch (cause) {
      if (requestId === requestRef.current) setMessage({ text: friendlyError(cause, 'The event roster could not be loaded.'), tone: 'error' })
    } finally {
      if (requestId === requestRef.current && showLoading) setRefreshing(false)
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    let current = true
    setLoading(true)
    void Promise.all([
      getEvent(eventId),
      getEventAttendanceRoster(eventId),
      listEventGuestAttendance(eventId),
    ]).then(([nextEvent, nextStudents, nextGuests]) => {
      if (!current) return
      setEventRecord(nextEvent)
      setStudents(nextStudents)
      setGuests(nextGuests)
      setLastUpdated(new Date())
    }).catch((cause: unknown) => {
      if (current) setMessage({ text: friendlyError(cause, 'This event roster is unavailable or you do not have access.'), tone: 'error' })
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId || !eventRecord) return
    let timer: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { if (!document.hidden) void refreshRoster() }, 600)
    }
    const unsubscribe = subscribeToEventRoster(eventId, scheduleRefresh)
    const interval = window.setInterval(scheduleRefresh, 30_000)
    const onVisibilityChange = () => { if (!document.hidden) scheduleRefresh() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [eventId, eventRecord, refreshRoster])

  useEffect(() => { setPage(1) }, [attendeeType, department, search, sex, status, year])

  const canManageRoster = !!profile && !!eventRecord && (
    profile.role === 'super_admin'
    || profile.role === 'admin'
    || (profile.role === 'faculty' && eventRecord.created_by === profile.id)
  )
  const canEditRoster = canManageRoster
    && eventRecord?.status !== 'draft'
    && !eventRecord?.attendance_finalized_at
  const canReopenRoster = profile?.role === 'super_admin' && !!eventRecord?.attendance_finalized_at
  const canViewReports = profile?.role !== 'officer'

  const summary = useMemo(() => {
    const expected = students.filter((row) => row.is_expected)
    const present = expected.filter((row) => row.attendance_status === 'present').length
    const late = expected.filter((row) => row.attendance_status === 'late').length
    const remaining = expected.filter((row) => row.attendance_status === 'absent').length
    return { expected: expected.length, present, late, remaining }
  }, [students])

  const departments = useMemo(() => [...new Map(students.map((row) => [row.department_id, { id: row.department_id, code: row.department_code }])).values()].sort((left, right) => left.code.localeCompare(right.code)), [students])
  const displayRows = useMemo<DisplayRosterRow[]>(() => [
    ...students.map((row) => ({ key: `student:${row.student_id}`, kind: 'student' as const, row })),
    ...guests.map((row) => ({ key: `guest:${row.id}`, kind: 'guest' as const, row })),
  ], [guests, students])
  const filteredRows = useMemo(() => displayRows.filter((item) => {
    const needle = search.trim().toLowerCase()
    const identity = item.kind === 'student'
      ? `${item.row.student_number} ${item.row.full_name} ${item.row.department_code}`
      : `${item.row.reference_number ?? ''} ${item.row.full_name} ${item.row.affiliation ?? ''}`
    if (needle && !identity.toLowerCase().includes(needle)) return false
    if (status !== 'all' && item.row.attendance_status !== status) return false
    if (attendeeType === 'registered' && item.kind !== 'student') return false
    if (attendeeType === 'temporary' && item.kind !== 'guest') return false
    if (department !== 'all' && (item.kind !== 'student' || item.row.department_id !== department)) return false
    if (year !== 'all' && (item.kind !== 'student' || item.row.year_level !== Number(year))) return false
    if (sex !== 'all' && (item.kind !== 'student' || item.row.sex !== sex)) return false
    return true
  }).sort((left, right) => {
    const value = (item: DisplayRosterRow) => {
      if (sortField === 'name') return item.row.full_name
      if (sortField === 'identity') return item.kind === 'student' ? item.row.student_number : item.row.reference_number ?? ''
      if (sortField === 'department') return item.kind === 'student' ? item.row.department_code : item.row.affiliation ?? ''
      if (sortField === 'year') return item.kind === 'student' ? item.row.year_level : 99
      if (sortField === 'status') return item.row.attendance_status
      if (sortField === 'time') return item.kind === 'student' ? item.row.check_in_at ?? '' : item.row.recorded_at
      return item.kind === 'student' ? item.row.check_in_method ?? '' : 'manual'
    }
    const leftValue = value(left)
    const rightValue = value(right)
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true })
    return sortDirection === 'asc' ? comparison : -comparison
  }), [attendeeType, department, displayRows, search, sex, sortDirection, sortField, status, year])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageStudentIds = pageRows.flatMap((item) => item.kind === 'student' ? [item.row.student_id] : [])
  const allPageStudentsSelected = !!pageStudentIds.length && pageStudentIds.every((id) => selectedStudentIds.has(id))
  const existingStudentIds = useMemo(() => new Set(students.map((row) => row.student_id)), [students])

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  const togglePageStudents = () => {
    setSelectedStudentIds((current) => {
      const next = new Set(current)
      if (allPageStudentsSelected) pageStudentIds.forEach((id) => next.delete(id))
      else pageStudentIds.forEach((id) => next.add(id))
      return next
    })
  }

  const changeSort = (nextField: SortField) => {
    if (sortField === nextField) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSortField(nextField); setSortDirection('asc') }
  }

  const applyBulkStatus = async (nextStatus: AttendanceReportStatus) => {
    if (!eventRecord || !selectedStudentIds.size) return
    if (nextStatus === 'absent' && !await confirm({
      title: 'Mark selected students absent?',
      message: `Existing attendance records for ${selectedStudentIds.size} selected student${selectedStudentIds.size === 1 ? '' : 's'} will be removed.`,
      confirmLabel: 'Mark absent',
      tone: 'danger',
    })) return
    setBusyAction(nextStatus)
    setMessage(null)
    try {
      const recordedAt = eventRecord.status === 'closed'
        ? nextStatus === 'late' ? eventRecord.late_after : eventRecord.start_at
        : new Date().toISOString()
      const changed = await setEventRosterAttendance({
        eventId: eventRecord.id,
        studentIds: [...selectedStudentIds],
        status: nextStatus,
        recordedAt,
      })
      setSelectedStudentIds(new Set())
      setMessage({ text: `${changed} student${changed === 1 ? '' : 's'} marked ${nextStatus}.`, tone: 'success' })
      await refreshRoster()
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The selected attendance records could not be updated.'), tone: 'error' })
    } finally {
      setBusyAction(null)
    }
  }

  const undoLatest = async () => {
    if (!eventRecord) return
    setBusyAction('undo')
    setMessage(null)
    try {
      const result = await undoLastEventRosterChange(eventRecord.id)
      setMessage({ text: result.message, tone: result.undone ? 'success' : 'info' })
      if (result.undone) await refreshRoster()
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The latest roster change could not be undone.'), tone: 'error' })
    } finally {
      setBusyAction(null)
    }
  }

  const toggleFinalized = async (finalized: boolean) => {
    if (!eventRecord) return
    const approved = await confirm(finalized ? {
      title: 'Finalize attendance?',
      message: 'The roster will become read-only. Review unresolved entries before continuing.',
      confirmLabel: 'Finalize roster',
      tone: 'primary',
    } : {
      title: 'Reopen finalized attendance?',
      message: 'Authorized managers will be able to edit this roster again.',
      confirmLabel: 'Reopen roster',
      tone: 'primary',
    })
    if (!approved) return
    setBusyAction('finalize')
    try {
      await setEventAttendanceFinalized(eventRecord.id, finalized)
      setEventRecord(await getEvent(eventRecord.id))
      setMessage({ text: finalized ? 'Attendance roster finalized.' : 'Attendance roster reopened for corrections.', tone: 'success' })
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The roster status could not be changed.'), tone: 'error' })
    } finally {
      setBusyAction(null)
    }
  }

  const exportRoster = async () => {
    if (!eventRecord || !filteredRows.length) return
    setExporting(true)
    setMessage(null)
    try {
      await exportEventRoster(
        eventRecord,
        filteredRows.flatMap((item) => item.kind === 'student' ? [item.row] : []),
        filteredRows.flatMap((item) => item.kind === 'guest' ? [item.row] : []),
      )
      setMessage({ text: `Roster exported with ${filteredRows.length} displayed attendee${filteredRows.length === 1 ? '' : 's'}.`, tone: 'success' })
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The roster export failed.'), tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const rosterSaved = async (text: string) => {
    setAddOpen(false)
    setEditing(null)
    setMessage({ text, tone: 'success' })
    await refreshRoster()
  }

  if (!eventId) return <Navigate to="/events" replace />
  if (loading) return <LoadingScreen label="Preparing attendance roster…" />
  if (!eventRecord) return <div className="mx-auto max-w-2xl space-y-4"><Link className="btn-secondary" to="/events">Back to events</Link><Alert message={message?.text ?? 'The event could not be loaded.'} /></div>

  return (
    <div className="space-y-5">
      <header className="page-header gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex min-w-0 items-center gap-2 text-sm text-slate-500"><Link className="font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300" to="/events">Events</Link><span>/</span><span className="truncate">{eventRecord.name}</span></div>
          <div className="flex flex-wrap items-center gap-2.5"><h1 className="page-title">Attendance roster</h1><span className={`status-chip capitalize ${eventRecord.status === 'open' ? 'bg-emerald-100 text-emerald-800' : eventRecord.status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{eventRecord.status}</span>{eventRecord.attendance_finalized_at && <span className="status-chip bg-blue-100 text-blue-800"><ShieldCheck size={13} /> Finalized</span>}</div>
          <p className="page-subtitle">Manage registered and temporary attendance for {eventRecord.name}. Registered changes update reports automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={refreshing} onClick={() => void refreshRoster(true)}><RefreshCw className={refreshing ? 'animate-spin' : ''} size={16} /> Refresh</button>
          {!eventRecord.is_historical && <Link className="btn-secondary" to={`/events/${eventRecord.id}/scanner`}><ScanLine size={16} /> Open scanner</Link>}
          <button className="btn-primary" disabled={exporting || !filteredRows.length} onClick={() => void exportRoster()}><Download size={16} /> {exporting ? 'Exporting…' : 'Export roster'}</button>
        </div>
      </header>

      <EventWorkspaceNav eventRecord={eventRecord} active="roster" canViewReports={canViewReports} />
      {message && <Alert message={message.text} tone={message.tone} />}
      {eventRecord.attendance_finalized_at ? (
        <Alert tone="info" message={`This roster was finalized on ${formatManilaDate(eventRecord.attendance_finalized_at)}. It is read-only until a Super Admin reopens it.`} />
      ) : eventRecord.status === 'draft' ? (
        <Alert tone="info" message="This event is still a draft. Open it before recording attendance." />
      ) : !canManageRoster ? (
        <Alert tone="info" message="You can monitor this roster, but attendance corrections are limited to authorized event managers." />
      ) : null}

      <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-4" aria-label="Attendance summary">
        <EventMetric label="Expected" value={summary.expected} icon={UsersRound} />
        <EventMetric label="Present" value={summary.present} tone="green" icon={UserRoundCheck} />
        <EventMetric label="Late" value={summary.late} tone="amber" icon={Clock3} />
        <EventMetric label="Remaining" value={summary.remaining} tone="blue" icon={UsersRound} />
      </section>

      <section className="roster-surface">
        <div className="roster-toolbar">
          <label className="relative w-full sm:w-52" aria-label="Search roster">
            <Search className="pointer-events-none absolute left-3.5 top-3 text-slate-400" size={18} />
            <input className="field pl-10" placeholder="Search name, student ID, or reference" value={search} onChange={(inputEvent) => setSearch(inputEvent.target.value)} />
          </label>
          <select aria-label="Filter attendance status" className="field roster-filter" value={status} onChange={(inputEvent) => setStatus(inputEvent.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select>
          <select aria-label="Filter attendee type" className="field roster-filter" value={attendeeType} onChange={(inputEvent) => setAttendeeType(inputEvent.target.value)}><option value="all">All attendees</option><option value="registered">Registered</option><option value="temporary">Temporary</option></select>
          <select aria-label="Filter department" className="field roster-filter-department" value={department} onChange={(inputEvent) => setDepartment(inputEvent.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
          <select aria-label="Filter year level" className="field roster-filter" value={year} onChange={(inputEvent) => setYear(inputEvent.target.value)}><option value="all">All years</option>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}</select>
          <select aria-label="Filter sex" className="field roster-filter-sex" value={sex} onChange={(inputEvent) => setSex(inputEvent.target.value)}><option value="all">All sexes</option><option value="Female">Female</option><option value="Male">Male</option></select>
          {canEditRoster && <button className="btn-secondary whitespace-nowrap" onClick={() => setAddOpen(true)}><Plus size={16} /> Add attendee</button>}
        </div>

        {(selectedStudentIds.size > 0 || canEditRoster) && (
          <div className={`roster-bulk-bar ${selectedStudentIds.size ? 'roster-bulk-bar-active' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-24 text-sm font-semibold text-blue-800 dark:text-blue-200">{selectedStudentIds.size ? `${selectedStudentIds.size} selected` : 'Bulk actions'}</span>
              <button className="roster-bulk-button text-emerald-700" disabled={!selectedStudentIds.size || !!busyAction} onClick={() => void applyBulkStatus('present')}><Check size={15} /> Mark present</button>
              <button className="roster-bulk-button text-amber-700" disabled={!selectedStudentIds.size || !!busyAction} onClick={() => void applyBulkStatus('late')}><Clock3 size={15} /> Mark late</button>
              <button className="roster-bulk-button text-slate-700" disabled={!selectedStudentIds.size || !!busyAction} onClick={() => void applyBulkStatus('absent')}><X size={15} /> Mark absent</button>
              {selectedStudentIds.size > 0 && <button className="btn-ghost min-h-9 px-2.5 py-1.5" disabled={!!busyAction} onClick={() => setSelectedStudentIds(new Set())}>Clear selection</button>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{guests.length} temporary attendee{guests.length === 1 ? '' : 's'} · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : 'Not updated yet'}</span>
              {canEditRoster && <button className="btn-secondary min-h-9 px-3 py-1.5" disabled={!!busyAction} onClick={() => void undoLatest()}><RotateCcw size={15} /> {busyAction === 'undo' ? 'Undoing…' : 'Undo latest change'}</button>}
              {eventRecord.status === 'closed' && canEditRoster && !eventRecord.attendance_finalized_at && <button className="btn-secondary min-h-9 px-3 py-1.5" disabled={!!busyAction} onClick={() => void toggleFinalized(true)}><LockKeyhole size={15} /> Finalize</button>}
              {canReopenRoster && <button className="btn-secondary min-h-9 px-3 py-1.5" disabled={!!busyAction} onClick={() => void toggleFinalized(false)}><RotateCcw size={15} /> Reopen roster</button>}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="roster-table">
            <thead><tr><th className="w-12"><input aria-label="Select all registered students on this page" checked={allPageStudentsSelected} disabled={!canEditRoster || !pageStudentIds.length} type="checkbox" onChange={togglePageStudents} /></th><th aria-sort={sortField === 'name' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('name')}>Student / attendee <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'identity' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('identity')}>ID number <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'department' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('department')}>Department <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'year' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('year')}>Year <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'status' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('status')}>Status <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'time' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('time')}>Time recorded <ArrowUpDown size={13} /></button></th><th aria-sort={sortField === 'method' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="table-sort-button" onClick={() => changeSort('method')}>Method <ArrowUpDown size={13} /></button></th><th>Remarks</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {pageRows.map((item) => {
                if (item.kind === 'student') {
                  const row = item.row
                  return <tr key={item.key} className={selectedStudentIds.has(row.student_id) ? 'roster-row-selected' : ''}>
                    <td><input aria-label={`Select ${row.full_name}`} checked={selectedStudentIds.has(row.student_id)} disabled={!canEditRoster} type="checkbox" onChange={() => toggleStudent(row.student_id)} /></td>
                    <td><div className="font-semibold text-slate-900 dark:text-slate-100">{row.full_name}</div><div className="mt-0.5 text-xs text-slate-500">{row.sex}{!row.is_expected && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">Outside expected audience</span>}</div></td>
                    <td className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{row.student_number}</td>
                    <td><span className="font-medium">{row.department_code}</span><div className="max-w-44 truncate text-xs text-slate-500" title={row.department_name}>{row.department_name}</div></td>
                    <td>{row.year_level}</td>
                    <td><span className={`status-chip capitalize ${statusStyle(row.attendance_status)}`}>{row.attendance_status}</span></td>
                    <td className="whitespace-nowrap">{row.check_in_at ? formatManilaDate(row.check_in_at) : '—'}</td>
                    <td><span className="text-xs font-semibold uppercase text-slate-500">{row.check_in_method ?? '—'}</span></td>
                    <td><span className="block max-w-56 truncate text-sm text-slate-600 dark:text-slate-300" title={row.remarks ?? ''}>{row.remarks || '—'}</span></td>
                    <td><div className="flex justify-end">{canEditRoster ? <button className="btn-secondary min-h-9 px-3 py-1.5" onClick={() => setEditing({ kind: 'student', row })}><Pencil size={14} /> Edit</button> : <span className="text-xs text-slate-400">Read only</span>}</div></td>
                  </tr>
                }
                const row = item.row
                return <tr key={item.key}>
                  <td><span className="grid h-4 w-4 place-items-center rounded-full bg-violet-100 text-[0.55rem] font-bold text-violet-700" title="Temporary attendee">T</span></td>
                  <td><div className="font-semibold text-slate-900 dark:text-slate-100">{row.full_name}</div><div className="mt-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">Temporary attendee</div></td>
                  <td className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{row.reference_number || '—'}</td>
                  <td>{row.affiliation || '—'}</td>
                  <td>—</td>
                  <td><span className={`status-chip capitalize ${statusStyle(row.attendance_status)}`}>{row.attendance_status}</span></td>
                  <td className="whitespace-nowrap">{formatManilaDate(row.recorded_at)}</td>
                  <td><span className="text-xs font-semibold uppercase text-slate-500">Manual</span></td>
                  <td><span className="block max-w-56 truncate text-sm text-slate-600 dark:text-slate-300" title={row.remarks ?? ''}>{row.remarks || '—'}</span></td>
                  <td><div className="flex justify-end">{canEditRoster ? <button className="btn-secondary min-h-9 px-3 py-1.5" onClick={() => setEditing({ kind: 'guest', row })}><Pencil size={14} /> Edit</button> : <span className="text-xs text-slate-400">Read only</span>}</div></td>
                </tr>
              })}
              {!pageRows.length && <tr><td colSpan={10}><EmptyState compact icon={SearchX} title="No roster entries found" description="Try changing the search or filters." /></td></tr>}
            </tbody>
          </table>
        </div>

        <footer className="roster-footer">
          <span>Showing {filteredRows.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length.toLocaleString()} entries</span>
          <div className="flex items-center gap-2"><button className="btn-secondary min-h-9 px-3 py-1.5" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span className="min-w-20 text-center font-medium">{safePage} / {pageCount}</span><button className="btn-secondary min-h-9 px-3 py-1.5" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button></div>
        </footer>
      </section>

      {addOpen && <AddRosterAttendeeModal eventRecord={eventRecord} existingStudentIds={existingStudentIds} onClose={() => setAddOpen(false)} onSaved={rosterSaved} />}
      {editing && <RosterEntryModal eventRecord={eventRecord} target={editing} onClose={() => setEditing(null)} onSaved={rosterSaved} />}
    </div>
  )
}
