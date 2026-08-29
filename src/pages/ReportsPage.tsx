import { Download, History, Pencil, Radio, RefreshCw, Search, SearchX } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { ViewModeToggle, type ViewMode } from '../components/ViewModeToggle'
import { AttendanceEditModal } from '../features/reports/AttendanceEditModal'
import { exportAttendanceReport } from '../features/reports/exportReport'
import type { ReportGroupSummary } from '../features/reports/ReportCharts'
import { StudentHistoryModal, type StudentHistoryTarget } from '../features/reports/StudentHistoryModal'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { subscribeToEventAttendance } from '../services/attendance'
import { listEvents } from '../services/events'
import { getEventAttendanceReport } from '../services/reports'
import { listStudents } from '../services/students'
import type { AttendanceReportRow, EventRecord, Student } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const PAGE_SIZE = 50

const ReportCharts = lazy(() => import('../features/reports/ReportCharts').then((module) => ({ default: module.ReportCharts })))

function groupReport(rows: AttendanceReportRow[], labelFor: (row: AttendanceReportRow) => string) {
  const groups = new Map<string, ReportGroupSummary>()
  for (const row of rows) {
    const label = labelFor(row)
    const current = groups.get(label) ?? { label, expected: 0, present: 0, late: 0, absent: 0 }
    if (row.is_expected) {
      current.expected += 1
      if (row.attendance_status === 'present') current.present += 1
      if (row.attendance_status === 'late') current.late += 1
      if (row.attendance_status === 'absent') current.absent += 1
    }
    groups.set(label, current)
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))
}

function SummaryDetails({ title, rows }: { title: string; rows: ReportGroupSummary[] }) {
  return (
    <section className="panel">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60" key={row.label}>
            <div className="font-semibold">{row.label}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><span className="block text-slate-500">Present</span><strong className="text-emerald-700 dark:text-emerald-300">{row.present}</strong></div>
              <div><span className="block text-slate-500">Late</span><strong className="text-amber-700 dark:text-amber-300">{row.late}</strong></div>
              <div><span className="block text-slate-500">Absent</span><strong>{row.absent}</strong></div>
            </div>
          </div>
        ))}
        {!rows.length && <p className="py-4 text-center text-sm text-slate-500 sm:col-span-2">No summary data.</p>}
      </div>
    </section>
  )
}

function statusStyle(status: AttendanceReportRow['attendance_status']) {
  if (status === 'present') return 'bg-emerald-100 text-emerald-800'
  if (status === 'late') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-200 text-slate-700'
}

export function ReportsPage() {
  const [searchParams] = useSearchParams()
  const requestedEventId = searchParams.get('event')
  const { profile } = useAuth()
  const canCorrect = profile?.role === 'super_admin' || profile?.role === 'admin'
  const [events, setEvents] = useState<EventRecord[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [eventId, setEventId] = useState('')
  const [rows, setRows] = useState<AttendanceReportRow[]>([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [status, setStatus] = useState('all')
  const [method, setMethod] = useState('all')
  const [studentSearch, setStudentSearch] = useState('')
  const [historyStudent, setHistoryStudent] = useState<StudentHistoryTarget | null>(null)
  const [editingRow, setEditingRow] = useState<AttendanceReportRow | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' | 'info' } | null>(null)
  const reportRequestRef = useRef(0)
  const activeEventRequestRef = useRef<string | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all([listEvents(), listStudents()]).then(([eventRows, studentRows]) => {
      if (!current) return
      setEvents(eventRows)
      setStudents(studentRows)
      setEventId(requestedEventId && eventRows.some((event) => event.id === requestedEventId) ? requestedEventId : eventRows[0]?.id ?? '')
    }).catch((cause: unknown) => {
      if (current) setMessage({ text: friendlyError(cause, 'Reports could not be prepared.'), tone: 'error' })
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [requestedEventId])

  const refreshReport = useCallback(async (showLoading = false) => {
    if (!eventId) { setRows([]); return }
    if (!showLoading && activeEventRequestRef.current === eventId) return
    const requestId = ++reportRequestRef.current
    activeEventRequestRef.current = eventId
    if (showLoading) setReportLoading(true)
    try {
      const nextRows = await getEventAttendanceReport(eventId)
      if (requestId !== reportRequestRef.current) return
      setRows(nextRows)
      setLastUpdated(new Date())
    } catch (cause) {
      if (requestId === reportRequestRef.current) setMessage({ text: friendlyError(cause, 'The attendance report could not be loaded.'), tone: 'error' })
    } finally {
      if (requestId === reportRequestRef.current) {
        activeEventRequestRef.current = null
        if (showLoading) setReportLoading(false)
      }
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    let refreshTimer: number | undefined
    const scheduleRefresh = (delay = 750, showLoading = false) => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        if (!document.hidden) void refreshReport(showLoading)
      }, delay)
    }
    scheduleRefresh(0, true)
    const unsubscribe = subscribeToEventAttendance(eventId, () => scheduleRefresh())
    const interval = window.setInterval(() => scheduleRefresh(0), 30_000)
    const onVisibilityChange = () => { if (!document.hidden) scheduleRefresh(0) }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
      window.clearTimeout(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [eventId, refreshReport])

  useEffect(() => { setPage(1) }, [department, eventId, method, search, status, year])

  const eventRecord = events.find((event) => event.id === eventId) ?? null
  const departments = useMemo(() => [...new Map(rows.map((row) => [row.department_id, { id: row.department_id, code: row.department_code }])).values()].sort((left, right) => left.code.localeCompare(right.code)), [rows])
  const filteredRows = useMemo(() => rows.filter((row) => {
    const needle = search.trim().toLowerCase()
    if (needle && !`${row.student_number} ${row.full_name}`.toLowerCase().includes(needle)) return false
    if (department !== 'all' && row.department_id !== department) return false
    if (year !== 'all' && row.year_level !== Number(year)) return false
    if (status !== 'all' && row.attendance_status !== status) return false
    if (method !== 'all' && row.check_in_method !== method) return false
    return true
  }), [department, method, rows, search, status, year])
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const summary = useMemo(() => {
    const expectedRows = rows.filter((row) => row.is_expected)
    const expected = expectedRows.length
    const present = expectedRows.filter((row) => row.attendance_status === 'present').length
    const late = expectedRows.filter((row) => row.attendance_status === 'late').length
    const absent = expectedRows.filter((row) => row.attendance_status === 'absent').length
    const checkedOut = expectedRows.filter((row) => !!row.check_out_at).length
    const outsideAudience = rows.filter((row) => !row.is_expected && !!row.check_in_at).length
    return { expected, present, late, absent, checkedOut, outsideAudience, rate: expected ? Math.round(((present + late) / expected) * 100) : 0 }
  }, [rows])
  const departmentSummary = useMemo(() => groupReport(rows, (row) => row.department_code), [rows])
  const yearSummary = useMemo(() => groupReport(rows, (row) => `Year ${row.year_level}`), [rows])
  const studentMatches = useMemo(() => {
    const needle = studentSearch.trim().toLowerCase()
    if (needle.length < 2) return []
    return students.filter((student) => `${student.student_number} ${student.full_name}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [studentSearch, students])

  const exportReport = async () => {
    if (!eventRecord || !filteredRows.length) return
    setExporting(true)
    setMessage(null)
    try {
      await exportAttendanceReport(eventRecord, filteredRows)
      setMessage({ text: `Excel report exported with ${filteredRows.length} displayed students.`, tone: 'success' })
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'Excel export failed.'), tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const correctionSaved = async (text: string) => {
    setEditingRow(null)
    setMessage({ text, tone: 'success' })
    await refreshReport()
  }

  if (loading) return <LoadingScreen label="Preparing reports…" />

  return (
    <div className="space-y-5">
      <header className="page-header">
        <div><h1 className="page-title">Reports</h1><p className="page-subtitle">Live event analytics, student history, corrections, and Excel exports.</p></div>
        <div className="flex flex-wrap gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} label="Report analytics view" />
          <button className="btn-secondary" disabled={!eventId || reportLoading} onClick={() => void refreshReport(true)}><RefreshCw className={reportLoading ? 'animate-spin' : ''} size={16} /> Refresh</button>
          <button className="btn-primary" disabled={!eventRecord || !filteredRows.length || exporting} onClick={() => void exportReport()}><Download size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}</button>
        </div>
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <section className="panel flex flex-wrap items-end gap-4">
        <label className="min-w-64 flex-1"><span className="label">Event</span><select className="field" value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {formatManilaDate(event.start_at)}</option>)}</select></label>
        <div className="pb-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Radio size={14} /> Live</span>{lastUpdated && <> · Updated {lastUpdated.toLocaleTimeString('en-PH')}</>}</div>
      </section>

      {!events.length ? <Alert tone="info" message="No accessible events are available for reporting." /> : reportLoading && !rows.length ? <LoadingScreen label="Building event report…" /> : (
        <>
          {viewMode === 'cards' ? (
            <>
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {[['Expected', summary.expected], ['Present', summary.present], ['Late', summary.late], ['Absent', summary.absent], ['Attendance', `${summary.rate}%`], ...(eventRecord?.attendance_mode === 'check_in_out' ? [['Checked out', summary.checkedOut]] : []), ...(summary.outsideAudience > 0 ? [['Outside audience', summary.outsideAudience]] : [])].map(([label, count]) => <div className="panel p-4" key={label}><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums">{count}</div></div>)}
              </section>
              <div className="grid gap-5 lg:grid-cols-2"><SummaryDetails title="Department summary" rows={departmentSummary} /><SummaryDetails title="Year-level summary" rows={yearSummary} /></div>
            </>
          ) : (
            <Suspense fallback={<div className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading report graphsâ€¦</div>}>
              <ReportCharts summary={summary} departmentSummary={departmentSummary} yearSummary={yearSummary} showCheckedOut={eventRecord?.attendance_mode === 'check_in_out'} />
            </Suspense>
          )}

          <section className="panel">
            <div className="flex items-center gap-2"><History size={18} /><h2 className="font-semibold">Student attendance history</h2></div>
            <p className="mt-1 text-xs text-slate-500">Search any active student to view attendance across completed events.</p>
            <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} /><input className="field pl-10" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search Student ID or name" /></div>
            {!!studentMatches.length && <div className="mt-2 divide-y rounded-lg border border-slate-200">{studentMatches.map((student) => <button className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50" key={student.id} onClick={() => { setHistoryStudent(student); setStudentSearch('') }}><span><span className="block text-sm font-medium">{student.full_name}</span><span className="text-xs text-slate-500">{student.student_number} · {student.departments?.code ?? 'Unknown'} · Year {student.year_level}</span></span><History className="text-slate-400" size={17} /></button>)}</div>}
          </section>

          <section className="panel flex flex-wrap gap-3 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search Student ID or name" />
            <select aria-label="Filter by department" className="field max-w-44" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
            <select aria-label="Filter by year level" className="field max-w-36" value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}</select>
            <select aria-label="Filter by attendance status" className="field max-w-36" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select>
            <select aria-label="Filter by attendance method" className="field max-w-36" value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All methods</option><option value="qr">QR</option><option value="manual">Manual</option></select>
          </section>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Student</th><th>Department</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Actions</th></tr></thead>
              <tbody>
                {pageRows.map((row) => <tr key={row.student_id}><td><div className="font-medium">{row.full_name}</div><div className="text-xs text-slate-500">{row.student_number} · {row.sex}</div>{!row.is_expected && <div className="mt-1 text-xs text-amber-700">Outside current expected list</div>}</td><td>{row.department_code}<div className="text-xs text-slate-500">Year {row.year_level}</div></td><td><span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusStyle(row.attendance_status)}`}>{row.attendance_status}</span></td><td>{row.check_in_at ? <>{formatManilaDate(row.check_in_at)}<div className="text-xs uppercase text-slate-500">{row.check_in_method}</div></> : '—'}</td><td>{row.check_out_at ? <>{formatManilaDate(row.check_out_at)}<div className="text-xs uppercase text-slate-500">{row.check_out_method}</div></> : '—'}</td><td><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setHistoryStudent({ id: row.student_id, student_number: row.student_number, full_name: row.full_name })}><History size={14} /> History</button>{canCorrect && <button className="btn-secondary" onClick={() => setEditingRow(row)}><Pencil size={14} /> Correct</button>}</div></td></tr>)}
                {!pageRows.length && <tr><td colSpan={6}><EmptyState compact icon={SearchX} title="No report rows found" description="Try changing the report filters." /></td></tr>}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-500">Page {page} of {pageCount} · {filteredRows.length} results</span><div className="flex gap-2"><button className="btn-secondary" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn-secondary" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>}
        </>
      )}

      {historyStudent && <StudentHistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}
      {editingRow && eventRecord && <AttendanceEditModal eventRecord={eventRecord} row={editingRow} onClose={() => setEditingRow(null)} onSaved={correctionSaved} />}
    </div>
  )
}
