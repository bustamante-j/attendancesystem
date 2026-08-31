import { CalendarDays, Download, History, Pencil, Radio, RefreshCw, Search, SearchX } from 'lucide-react'
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

type ReportTab = 'overview' | 'attendance' | 'history'

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendance', label: 'Attendance list' },
  { id: 'history', label: 'Student history' },
]

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

function SummaryTable({ title, labelHeading, rows }: { title: string; labelHeading: string; rows: ReportGroupSummary[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.25rem)] gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950/35 dark:text-slate-400">
          <span>{labelHeading}</span><span className="text-right">Present</span><span className="text-right">Late</span><span className="text-right">Absent</span>
        </div>
        {rows.map((row) => (
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.25rem)] gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800" key={row.label}>
            <span className="truncate font-medium text-slate-800 dark:text-slate-100">{row.label}</span>
            <strong className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{row.present}</strong>
            <strong className="text-right font-semibold tabular-nums text-amber-700 dark:text-amber-300">{row.late}</strong>
            <strong className="text-right font-semibold tabular-nums text-red-700 dark:text-red-300">{row.absent}</strong>
          </div>
        ))}
        {!rows.length && <p className="px-4 py-8 text-center text-sm text-slate-500">No summary data.</p>}
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
  const [studentsLoaded, setStudentsLoaded] = useState(false)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')
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
    void listEvents().then((eventRows) => {
      if (!current) return
      setEvents(eventRows)
      setEventId(requestedEventId && eventRows.some((event) => event.id === requestedEventId) ? requestedEventId : eventRows[0]?.id ?? '')
    }).catch((cause: unknown) => {
      if (current) setMessage({ text: friendlyError(cause, 'Reports could not be prepared.'), tone: 'error' })
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [requestedEventId])

  useEffect(() => {
    if (activeTab !== 'history' || studentsLoaded) return
    let current = true
    setStudentsLoading(true)
    void listStudents().then((studentRows) => {
      if (!current) return
      setStudents(studentRows)
      setStudentsLoaded(true)
    }).catch((cause: unknown) => {
      if (current) setMessage({ text: friendlyError(cause, 'Student history search could not be prepared.'), tone: 'error' })
    }).finally(() => { if (current) setStudentsLoading(false) })
    return () => { current = false }
  }, [activeTab, studentsLoaded])

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
  const studentCountLabel = `${filteredRows.length.toLocaleString()} ${filteredRows.length === 1 ? 'student' : 'students'}`
  const resultCountLabel = `${filteredRows.length.toLocaleString()} ${filteredRows.length === 1 ? 'result' : 'results'}`

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
        <div><h1 className="page-title">Reports</h1><p className="page-subtitle">Event attendance insights and exports.</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!eventId || reportLoading} onClick={() => void refreshReport(true)}><RefreshCw className={reportLoading ? 'animate-spin' : ''} size={16} /> Refresh</button>
          <button className="btn-primary" disabled={!eventRecord || !filteredRows.length || exporting} onClick={() => void exportReport()}><Download size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}</button>
        </div>
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1"><span className="label">Event</span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-3 text-slate-400" size={17} /><select className="field pl-10" value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {formatManilaDate(event.start_at)}</option>)}</select></span></label>
        <div className="pb-2 text-xs text-slate-500 sm:text-right"><span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300"><Radio size={14} /> Live</span>{lastUpdated ? <> · Updated {lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</> : null}</div>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Report sections" role="tablist">
        {REPORT_TABS.map((tab) => (
          <button aria-controls={`report-panel-${tab.id}`} aria-selected={activeTab === tab.id} className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition ${activeTab === tab.id ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'}`} id={`report-tab-${tab.id}`} key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" type="button">
            {tab.label}
          </button>
        ))}
      </nav>

      {!events.length ? <Alert tone="info" message="No accessible events are available for reporting." /> : reportLoading && !rows.length ? <LoadingScreen label="Building event report…" /> : (
        <>
          {activeTab === 'overview' && (
            <div aria-labelledby="report-tab-overview" className="space-y-5" id="report-panel-overview" role="tabpanel">
              <div className="flex justify-end"><ViewModeToggle value={viewMode} onChange={setViewMode} label="Report analytics view" /></div>
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="grid grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Expected', value: summary.expected, tone: 'text-slate-950 dark:text-white' },
                    { label: 'Attended', value: summary.present + summary.late, tone: 'text-emerald-700 dark:text-emerald-300', context: `${summary.rate}% attendance` },
                    { label: 'Late', value: summary.late, tone: 'text-amber-700 dark:text-amber-300' },
                    { label: 'Absent', value: summary.absent, tone: 'text-red-700 dark:text-red-300' },
                  ].map((metric, index) => (
                    <div className={`min-h-28 px-5 py-5 text-center ${index % 2 === 0 ? 'border-r' : ''} ${index < 2 ? 'border-b lg:border-b-0' : ''} border-slate-200 lg:border-r lg:last:border-r-0 dark:border-slate-800`} key={metric.label}>
                      <div className="text-sm font-medium text-slate-500">{metric.label}</div>
                      <div className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${metric.tone}`}>{metric.value.toLocaleString()}</div>
                      {metric.context ? <div className="mt-1 text-xs text-slate-500">{metric.context}</div> : null}
                    </div>
                  ))}
                </div>
                {(eventRecord?.attendance_mode === 'check_in_out' || summary.outsideAudience > 0) && (
                  <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
                    {eventRecord?.attendance_mode === 'check_in_out' ? <span><strong className="text-slate-700 dark:text-slate-200">{summary.checkedOut}</strong> checked out</span> : null}
                    {summary.outsideAudience > 0 ? <span><strong className="text-amber-700 dark:text-amber-300">{summary.outsideAudience}</strong> outside the expected audience</span> : null}
                  </div>
                )}
              </section>

              {viewMode === 'cards' ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <SummaryTable title="By department" labelHeading="Department" rows={departmentSummary} />
                  <SummaryTable title="By year level" labelHeading="Year level" rows={yearSummary} />
                </div>
              ) : (
                <Suspense fallback={<div className="grid min-h-80 place-items-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading report graphs…</div>}>
                  <ReportCharts summary={summary} departmentSummary={departmentSummary} yearSummary={yearSummary} showCheckedOut={eventRecord?.attendance_mode === 'check_in_out'} />
                </Suspense>
              )}
            </div>
          )}

          {activeTab === 'attendance' && (
            <div aria-labelledby="report-tab-attendance" className="space-y-4" id="report-panel-attendance" role="tabpanel">
              <section className="flex flex-wrap items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Search Student ID or name" />
                <select aria-label="Filter by department" className="field w-full sm:w-44" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
                <select aria-label="Filter by year level" className="field w-full sm:w-36" value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}</select>
                <select aria-label="Filter by attendance status" className="field w-full sm:w-36" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select>
                <select aria-label="Filter by attendance method" className="field w-full sm:w-36" value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All methods</option><option value="qr">QR</option><option value="manual">Manual</option></select>
              </section>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex justify-end border-b border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-500 dark:border-slate-800">{studentCountLabel}</div>
                <div className="overflow-x-auto">
                  <table className="report-table">
                    <thead><tr><th>Student</th><th>Department</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Actions</th></tr></thead>
                    <tbody>
                      {pageRows.map((row) => <tr key={row.student_id}><td><div className="font-medium">{row.full_name}</div><div className="text-xs text-slate-500">{row.student_number} · {row.sex}</div>{!row.is_expected && <div className="mt-1 text-xs text-amber-700">Outside current expected list</div>}</td><td>{row.department_code}<div className="text-xs text-slate-500">Year {row.year_level}</div></td><td><span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusStyle(row.attendance_status)}`}>{row.attendance_status}</span></td><td>{row.check_in_at ? <>{formatManilaDate(row.check_in_at)}<div className="text-xs uppercase text-slate-500">{row.check_in_method}</div></> : '—'}</td><td>{row.check_out_at ? <>{formatManilaDate(row.check_out_at)}<div className="text-xs uppercase text-slate-500">{row.check_out_method}</div></> : '—'}</td><td><div className="flex flex-wrap gap-2"><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => setHistoryStudent({ id: row.student_id, student_number: row.student_number, full_name: row.full_name })}><History size={14} /> History</button>{canCorrect && <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={() => setEditingRow(row)}><Pencil size={14} /> Correct</button>}</div></td></tr>)}
                      {!pageRows.length && <tr><td colSpan={6}><EmptyState compact icon={SearchX} title="No report rows found" description="Try changing the report filters." /></td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                  <span className="text-xs text-slate-500">Page {page} of {pageCount} · {resultCountLabel}</span>
                  <div className="flex gap-2"><button className="btn-secondary min-h-9 py-1.5 text-xs" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className="btn-secondary min-h-9 py-1.5 text-xs" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <section aria-labelledby="report-tab-history" className="mx-auto max-w-3xl py-3" id="report-panel-history" role="tabpanel">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                <div className="flex items-center gap-2"><History className="text-blue-600 dark:text-blue-400" size={19} /><h2 className="font-semibold">Student attendance history</h2></div>
                <p className="mt-1 text-sm text-slate-500">Find a student to view attendance across completed events.</p>
                <div className="relative mt-5"><Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} /><input aria-label="Search student history" className="field pl-10" disabled={studentsLoading} value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder={studentsLoading ? 'Loading students…' : 'Search Student ID or name'} /></div>
                {studentSearch.trim().length === 1 ? <p className="mt-2 text-xs text-slate-500">Enter at least 2 characters.</p> : null}
                {!!studentMatches.length && <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{studentMatches.map((student) => <button className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60" key={student.id} onClick={() => { setHistoryStudent(student); setStudentSearch('') }}><span><span className="block text-sm font-medium">{student.full_name}</span><span className="text-xs text-slate-500">{student.student_number} · {student.departments?.code ?? 'Unknown'} · Year {student.year_level}</span></span><History className="shrink-0 text-slate-400" size={17} /></button>)}</div>}
                {studentsLoaded && studentSearch.trim().length >= 2 && !studentMatches.length ? <div className="mt-4"><EmptyState compact icon={SearchX} title="No students found" description="Try another name or Student ID." /></div> : null}
              </div>
            </section>
          )}
        </>
      )}

      {historyStudent && <StudentHistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}
      {editingRow && eventRecord && <AttendanceEditModal eventRecord={eventRecord} row={editingRow} onClose={() => setEditingRow(null)} onSaved={correctionSaved} />}
    </div>
  )
}
