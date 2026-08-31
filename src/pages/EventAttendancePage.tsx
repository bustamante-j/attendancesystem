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
  SearchX,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
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
  EventStatus,
} from '../types/app'
import { formatManilaDate } from '../utils/dates'

const PAGE_SIZE = 50
type SortField = 'name' | 'identity' | 'department' | 'status' | 'time'

type DisplayRosterRow =
  | { key: string; kind: 'student'; row: EventRosterStudentRow }
  | { key: string; kind: 'guest'; row: EventGuestAttendance }

const attendanceTone: Record<AttendanceReportStatus, StatusTone> = { present: 'ok', late: 'warn', absent: 'neutral' }
const eventTone: Record<EventStatus, StatusTone> = { open: 'ok', draft: 'warn', closed: 'neutral' }

const SORT_COLUMNS: { field: SortField; label: string }[] = [
  { field: 'name', label: 'Attendee' },
  { field: 'department', label: 'Department' },
  { field: 'status', label: 'Status' },
  { field: 'time', label: 'Recorded' },
]

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
      if (sortField === 'status') return item.row.attendance_status
      return item.kind === 'student' ? item.row.check_in_at ?? '' : item.row.recorded_at
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
  if (!eventRecord) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Link className="btn-secondary" to="/events">Back to events</Link>
        <Alert message={message?.text ?? 'The event could not be loaded.'} />
      </div>
    )
  }

  const showingFrom = filteredRows.length ? (safePage - 1) * PAGE_SIZE + 1 : 0
  const showingTo = Math.min(safePage * PAGE_SIZE, filteredRows.length)

  return (
    <div className="page">
      <header className="page-header">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-meta text-muted">
            <Link className="link" to="/events">Events</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">{eventRecord.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">Attendance roster</h1>
            <StatusBadge tone={eventTone[eventRecord.status]} variant="soft">{eventRecord.status}</StatusBadge>
            {eventRecord.attendance_finalized_at && (
              <span className="badge badge-accent"><ShieldCheck size={12} /> Finalized</span>
            )}
          </div>
          <p className="page-subtitle">
            {guests.length} temporary attendee{guests.length === 1 ? '' : 's'}
            {lastUpdated && <> · Updated {lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="icon-btn" disabled={refreshing} onClick={() => void refreshRoster(true)} aria-label="Refresh roster">
            <RefreshCw className={refreshing ? 'animate-spin' : ''} size={15} />
          </button>
          {!eventRecord.is_historical && (
            <Link className="btn-secondary" to={`/events/${eventRecord.id}/scanner`}><ScanLine size={15} /> Scanner</Link>
          )}
          <button className="btn-primary" disabled={exporting || !filteredRows.length} onClick={() => void exportRoster()}>
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export'}
          </button>
          <ActionMenu
            label="Roster options"
            items={[
              canEditRoster && { icon: RotateCcw, label: 'Undo latest change', disabled: !!busyAction, onSelect: () => void undoLatest() },
              eventRecord.status === 'closed' && canEditRoster && !eventRecord.attendance_finalized_at && {
                icon: LockKeyhole, label: 'Finalize roster', disabled: !!busyAction, onSelect: () => void toggleFinalized(true),
              },
              canReopenRoster && { icon: RotateCcw, label: 'Reopen roster', disabled: !!busyAction, onSelect: () => void toggleFinalized(false) },
            ]}
          />
        </div>
      </header>

      <EventWorkspaceNav eventRecord={eventRecord} active="roster" canViewReports={canViewReports} />

      {message && <Alert message={message.text} tone={message.tone} />}
      {eventRecord.attendance_finalized_at ? (
        <Alert tone="info" message={`Finalized on ${formatManilaDate(eventRecord.attendance_finalized_at)}. Read-only until a Super Admin reopens it.`} />
      ) : eventRecord.status === 'draft' ? (
        <Alert tone="info" message="This event is still a draft. Open it before recording attendance." />
      ) : !canManageRoster ? (
        <Alert tone="info" message="You can monitor this roster, but corrections are limited to authorized event managers." />
      ) : null}

      <section className="stat-strip grid-cols-2 lg:grid-cols-4" aria-label="Attendance summary">
        <div className="stat">
          <div className="stat-label"><UsersRound className="mr-1 inline align-[-2px] text-subtle" size={13} /> Expected</div>
          <div className="stat-value">{summary.expected.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label"><UserRoundCheck className="mr-1 inline align-[-2px] text-ok" size={13} /> Present</div>
          <div className="stat-value">{summary.present.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label"><Clock3 className="mr-1 inline align-[-2px] text-warn" size={13} /> Late</div>
          <div className="stat-value">{summary.late.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label"><UsersRound className="mr-1 inline align-[-2px] text-subtle" size={13} /> Remaining</div>
          <div className="stat-value">{summary.remaining.toLocaleString()}</div>
        </div>
      </section>

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID, or reference" className="min-w-52 flex-1" />
        <select aria-label="Filter attendance status" className="field w-auto min-w-28" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
        <select aria-label="Filter attendee type" className="field w-auto min-w-28" value={attendeeType} onChange={(event) => setAttendeeType(event.target.value)}>
          <option value="all">All attendees</option>
          <option value="registered">Registered</option>
          <option value="temporary">Temporary</option>
        </select>
        <select aria-label="Filter department" className="field w-auto min-w-28" value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="all">All departments</option>
          {departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
        </select>
        <select aria-label="Filter year level" className="field w-auto min-w-24" value={year} onChange={(event) => setYear(event.target.value)}>
          <option value="all">All years</option>
          {[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}
        </select>
        <select aria-label="Filter sex" className="field w-auto min-w-24" value={sex} onChange={(event) => setSex(event.target.value)}>
          <option value="all">All sexes</option>
          <option value="Female">Female</option>
          <option value="Male">Male</option>
        </select>
        {canEditRoster && (
          <button className="btn-secondary whitespace-nowrap" onClick={() => setAddOpen(true)}><Plus size={15} /> Add attendee</button>
        )}
      </div>

      <section className="table-shell">
        {/* Bulk actions surface only when there is a selection to act on. */}
        {selectedStudentIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5">
            <span className="text-base font-medium text-accent-ink">{selectedStudentIds.size} selected</span>
            <button className="btn-secondary btn-sm" disabled={!!busyAction} onClick={() => void applyBulkStatus('present')}>
              <Check size={14} /> Present
            </button>
            <button className="btn-secondary btn-sm" disabled={!!busyAction} onClick={() => void applyBulkStatus('late')}>
              <Clock3 size={14} /> Late
            </button>
            <button className="btn-secondary btn-sm" disabled={!!busyAction} onClick={() => void applyBulkStatus('absent')}>
              <X size={14} /> Absent
            </button>
            <button className="btn-ghost btn-sm ml-auto" disabled={!!busyAction} onClick={() => setSelectedStudentIds(new Set())}>
              Clear
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table className="min-w-[62rem]">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    aria-label="Select all registered students on this page"
                    checked={allPageStudentsSelected}
                    disabled={!canEditRoster || !pageStudentIds.length}
                    type="checkbox"
                    onChange={togglePageStudents}
                  />
                </th>
                {SORT_COLUMNS.map(({ field, label }) => (
                  <th key={field} aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button className="table-sort" onClick={() => changeSort(field)}>
                      {label} <ArrowUpDown size={12} className={sortField === field ? 'text-accent' : 'opacity-50'} />
                    </button>
                  </th>
                ))}
                <th>Remarks</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
                if (item.kind === 'student') {
                  const row = item.row
                  return (
                    <tr key={item.key} className={selectedStudentIds.has(row.student_id) ? 'bg-accent-soft/60' : ''}>
                      <td>
                        <input
                          aria-label={`Select ${row.full_name}`}
                          checked={selectedStudentIds.has(row.student_id)}
                          disabled={!canEditRoster}
                          type="checkbox"
                          onChange={() => toggleStudent(row.student_id)}
                        />
                      </td>
                      <td>
                        <div className="cell-title">{row.full_name}</div>
                        <div className="cell-meta">
                          <span className="font-mono">{row.student_number}</span>
                          <span className="px-1.5 text-line-strong">·</span>
                          {row.sex}
                          {!row.is_expected && <span className="ml-2 text-warn-ink">Outside audience</span>}
                        </div>
                      </td>
                      <td>
                        <div className="text-ink">{row.department_code}</div>
                        <div className="cell-meta">Year {row.year_level}</div>
                      </td>
                      <td><StatusBadge tone={attendanceTone[row.attendance_status]}>{row.attendance_status}</StatusBadge></td>
                      <td className="whitespace-nowrap">
                        {row.check_in_at ? (
                          <>
                            <div className="text-ink">{formatManilaDate(row.check_in_at)}</div>
                            <div className="cell-meta uppercase">{row.check_in_method ?? '—'}</div>
                          </>
                        ) : <span className="text-subtle">—</span>}
                      </td>
                      <td className="max-w-56">
                        <span className="block truncate text-muted" title={row.remarks ?? ''}>{row.remarks || '—'}</span>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          {canEditRoster ? (
                            <ActionMenu
                              label={`Actions for ${row.full_name}`}
                              items={[{ icon: Pencil, label: 'Edit attendance', onSelect: () => setEditing({ kind: 'student', row }) }]}
                            />
                          ) : <span className="text-meta text-subtle">Read only</span>}
                        </div>
                      </td>
                    </tr>
                  )
                }
                const row = item.row
                return (
                  <tr key={item.key}>
                    <td />
                    <td>
                      <div className="cell-title">{row.full_name}</div>
                      <div className="cell-meta">
                        {row.reference_number && <><span className="font-mono">{row.reference_number}</span><span className="px-1.5 text-line-strong">·</span></>}
                        <span className="text-accent-ink">Temporary</span>
                      </div>
                    </td>
                    <td><span className="text-muted">{row.affiliation || '—'}</span></td>
                    <td><StatusBadge tone={attendanceTone[row.attendance_status]}>{row.attendance_status}</StatusBadge></td>
                    <td className="whitespace-nowrap">
                      <div className="text-ink">{formatManilaDate(row.recorded_at)}</div>
                      <div className="cell-meta uppercase">Manual</div>
                    </td>
                    <td className="max-w-56">
                      <span className="block truncate text-muted" title={row.remarks ?? ''}>{row.remarks || '—'}</span>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        {canEditRoster ? (
                          <ActionMenu
                            label={`Actions for ${row.full_name}`}
                            items={[{ icon: Pencil, label: 'Edit attendance', onSelect: () => setEditing({ kind: 'guest', row }) }]}
                          />
                        ) : <span className="text-meta text-subtle">Read only</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!pageRows.length && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState compact icon={SearchX} title="No roster entries found" description="Try changing the search or filters." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot">
          <span>{showingFrom}–{showingTo} of {filteredRows.length.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm" disabled={safePage === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="tabular-nums">Page {safePage} of {pageCount}</span>
            <button className="btn-secondary btn-sm" disabled={safePage === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>
      </section>

      {addOpen && <AddRosterAttendeeModal eventRecord={eventRecord} existingStudentIds={existingStudentIds} onClose={() => setAddOpen(false)} onSaved={rosterSaved} />}
      {editing && <RosterEntryModal eventRecord={eventRecord} target={editing} onClose={() => setEditing(null)} onSaved={rosterSaved} />}
    </div>
  )
}
