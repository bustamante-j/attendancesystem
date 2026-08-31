import { Download, History, Pencil, RefreshCw, Search, SearchX } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
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
import type { AttendanceReportRow, AttendanceReportStatus, EventRecord, Student } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const PAGE_SIZE = 50

type ReportTab = 'overview' | 'attendance' | 'history'

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendance', label: 'Attendance list' },
  { id: 'history', label: 'Student history' },
]

const statusTone: Record<AttendanceReportStatus, StatusTone> = { present: 'ok', late: 'warn', absent: 'neutral' }

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
    <section className="table-shell">
      <div className="surface-head"><h2 className="section-title">{title}</h2></div>
      <table>
        <thead>
          <tr>
            <th>{labelHeading}</th>
            <th className="text-right">Present</th>
            <th className="text-right">Late</th>
            <th className="text-right">Absent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="cell-title">{row.label}</td>
              <td className="text-right tabular-nums">{row.present}</td>
              <td className="text-right tabular-nums">{row.late}</td>
              <td className="text-right tabular-nums text-muted">{row.absent}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={4} className="py-8 text-center text-muted">No summary data.</td></tr>}
        </tbody>
      </table>
    </section>
  )
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
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">
            Event attendance insights and exports.
            {lastUpdated && <> Updated {lastUpdated.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="icon-btn" disabled={!eventId || reportLoading} onClick={() => void refreshReport(true)} aria-label="Refresh report">
            <RefreshCw className={reportLoading ? 'animate-spin' : ''} size={15} />
          </button>
          <button className="btn-primary" disabled={!eventRecord || !filteredRows.length || exporting} onClick={() => void exportReport()}>
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      {!events.length ? <Alert tone="info" message="No accessible events are available for reporting." /> : (
        <>
          <label className="block max-w-xl">
            <span className="label">Event</span>
            <select className="field" value={eventId} onChange={(event) => setEventId(event.target.value)}>
              {events.map((event) => <option key={event.id} value={event.id}>{event.name} · {formatManilaDate(event.start_at)}</option>)}
            </select>
          </label>

          <nav className="tabs" aria-label="Report sections" role="tablist">
            {REPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`report-tab-${tab.id}`}
                aria-controls={`report-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className={`tab ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {reportLoading && !rows.length ? <LoadingScreen label="Building event report…" /> : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6" id="report-panel-overview" role="tabpanel" aria-labelledby="report-tab-overview">
                  <section className="stat-strip grid-cols-2 lg:grid-cols-4">
                    <div className="stat">
                      <div className="stat-label">Expected</div>
                      <div className="stat-value">{summary.expected.toLocaleString()}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Attended</div>
                      <div className="stat-value">{(summary.present + summary.late).toLocaleString()}</div>
                      <div className="mt-0.5 text-meta text-muted">{summary.rate}% of expected</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Late</div>
                      <div className="stat-value">{summary.late.toLocaleString()}</div>
                    </div>
                    <div className="stat">
                      <div className="stat-label">Absent</div>
                      <div className="stat-value">{summary.absent.toLocaleString()}</div>
                    </div>
                  </section>

                  {(eventRecord?.attendance_mode === 'check_in_out' || summary.outsideAudience > 0) && (
                    <p className="flex flex-wrap gap-x-5 gap-y-1 text-base text-muted">
                      {eventRecord?.attendance_mode === 'check_in_out' && <span><span className="text-ink">{summary.checkedOut}</span> checked out</span>}
                      {summary.outsideAudience > 0 && <span><span className="text-warn-ink">{summary.outsideAudience}</span> outside the expected audience</span>}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <ViewModeToggle value={viewMode} onChange={setViewMode} label="Report analytics view" />
                  </div>

                  {viewMode === 'cards' ? (
                    <div className="grid gap-5 lg:grid-cols-2">
                      <SummaryTable title="By department" labelHeading="Department" rows={departmentSummary} />
                      <SummaryTable title="By year level" labelHeading="Year level" rows={yearSummary} />
                    </div>
                  ) : (
                    <Suspense fallback={<div className="surface grid min-h-80 place-items-center text-base text-muted">Loading charts…</div>}>
                      <ReportCharts
                        summary={summary}
                        departmentSummary={departmentSummary}
                        yearSummary={yearSummary}
                        showCheckedOut={eventRecord?.attendance_mode === 'check_in_out'}
                      />
                    </Suspense>
                  )}
                </div>
              )}

              {activeTab === 'attendance' && (
                <div className="space-y-4" id="report-panel-attendance" role="tabpanel" aria-labelledby="report-tab-attendance">
                  <div className="filter-bar">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search ID or name" />
                    <select aria-label="Filter by department" className="field w-auto min-w-32" value={department} onChange={(event) => setDepartment(event.target.value)}>
                      <option value="all">All departments</option>
                      {departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
                    </select>
                    <select aria-label="Filter by year level" className="field w-auto min-w-28" value={year} onChange={(event) => setYear(event.target.value)}>
                      <option value="all">All years</option>
                      {[1, 2, 3, 4].map((item) => <option key={item} value={item}>Year {item}</option>)}
                    </select>
                    <select aria-label="Filter by attendance status" className="field w-auto min-w-28" value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                    </select>
                    <select aria-label="Filter by attendance method" className="field w-auto min-w-28" value={method} onChange={(event) => setMethod(event.target.value)}>
                      <option value="all">All methods</option>
                      <option value="qr">QR</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>

                  <div className="table-shell">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Department</th>
                            <th>Status</th>
                            <th>Check-in</th>
                            <th>Check-out</th>
                            <th className="w-12" aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row) => (
                            <tr key={row.student_id}>
                              <td>
                                <div className="cell-title">{row.full_name}</div>
                                <div className="cell-meta">
                                  <span className="font-mono">{row.student_number}</span>
                                  <span className="px-1.5 text-line-strong">·</span>
                                  {row.sex}
                                  {!row.is_expected && <span className="ml-2 text-warn-ink">Outside expected list</span>}
                                </div>
                              </td>
                              <td>
                                <div className="text-ink">{row.department_code}</div>
                                <div className="cell-meta">Year {row.year_level}</div>
                              </td>
                              <td><StatusBadge tone={statusTone[row.attendance_status]}>{row.attendance_status}</StatusBadge></td>
                              <td className="whitespace-nowrap">
                                {row.check_in_at ? (
                                  <>
                                    <div className="text-ink">{formatManilaDate(row.check_in_at)}</div>
                                    <div className="cell-meta uppercase">{row.check_in_method}</div>
                                  </>
                                ) : <span className="text-subtle">—</span>}
                              </td>
                              <td className="whitespace-nowrap">
                                {row.check_out_at ? (
                                  <>
                                    <div className="text-ink">{formatManilaDate(row.check_out_at)}</div>
                                    <div className="cell-meta uppercase">{row.check_out_method}</div>
                                  </>
                                ) : <span className="text-subtle">—</span>}
                              </td>
                              <td>
                                <div className="flex justify-end">
                                  <ActionMenu
                                    label={`Actions for ${row.full_name}`}
                                    items={[
                                      { icon: History, label: 'Attendance history', onSelect: () => setHistoryStudent({ id: row.student_id, student_number: row.student_number, full_name: row.full_name }) },
                                      canCorrect && { icon: Pencil, label: 'Correct attendance', onSelect: () => setEditingRow(row) },
                                    ]}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!pageRows.length && (
                            <tr>
                              <td colSpan={6}>
                                <EmptyState compact icon={SearchX} title="No report rows found" description="Try changing the report filters." />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="table-foot">
                      <span>{filteredRows.length.toLocaleString()} {filteredRows.length === 1 ? 'result' : 'results'}</span>
                      <div className="flex items-center gap-2">
                        <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button>
                        <span className="tabular-nums">Page {page} of {pageCount}</span>
                        <button className="btn-secondary btn-sm" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <section className="mx-auto max-w-2xl" id="report-panel-history" role="tabpanel" aria-labelledby="report-tab-history">
                  <h2 className="section-title">Student attendance history</h2>
                  <p className="section-note">Find a student to view attendance across completed events.</p>
                  <div className="relative mt-4">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" size={16} />
                    <input
                      aria-label="Search student history"
                      className="field pl-9"
                      disabled={studentsLoading}
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder={studentsLoading ? 'Loading students…' : 'Search ID or name'}
                    />
                  </div>
                  {studentSearch.trim().length === 1 && <p className="mt-2 text-meta text-muted">Enter at least 2 characters.</p>}
                  {!!studentMatches.length && (
                    <div className="table-shell mt-3">
                      <ul className="divide-y divide-line">
                        {studentMatches.map((student) => (
                          <li key={student.id}>
                            <button
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken"
                              onClick={() => { setHistoryStudent(student); setStudentSearch('') }}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-base text-ink">{student.full_name}</span>
                                <span className="cell-meta block">
                                  {student.student_number} · {student.departments?.code ?? 'Unknown'} · Year {student.year_level}
                                </span>
                              </span>
                              <History className="shrink-0 text-subtle" size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {studentsLoaded && studentSearch.trim().length >= 2 && !studentMatches.length && (
                    <div className="mt-4">
                      <EmptyState compact icon={SearchX} title="No students found" description="Try another name or Student ID." />
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {historyStudent && <StudentHistoryModal student={historyStudent} onClose={() => setHistoryStudent(null)} />}
      {editingRow && eventRecord && <AttendanceEditModal eventRecord={eventRecord} row={editingRow} onClose={() => setEditingRow(null)} onSaved={correctionSaved} />}
    </div>
  )
}
