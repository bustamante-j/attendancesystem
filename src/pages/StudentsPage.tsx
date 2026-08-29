import { Eye, FileUp, KeyRound, Pencil, Plus, Printer, RotateCcw, SearchX, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { useAuth } from '../features/auth/AuthProvider'
import { QrCredentialModal } from '../features/students/QrCredentialModal'
import { StudentFormModal } from '../features/students/StudentFormModal'
import { StudentImportModal } from '../features/students/StudentImportModal'
import { friendlyError } from '../lib/errors'
import { listDepartments } from '../services/departments'
import { batchIssueStudentQrs, createStudent, issueStudentQr, listStudentQrStatuses, listStudents, restoreStudent, setStudentActive, softDeleteStudent, updateStudent, viewStudentQr, type StudentInput, type StudentQrStatus } from '../services/students'
import type { Department, Student } from '../types/app'
import { formatManilaDate } from '../utils/dates'

const PAGE_SIZE = 25

export function StudentsPage() {
  const confirm = useConfirm()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'super_admin'
  const [students, setStudents] = useState<Student[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [qrStatuses, setQrStatuses] = useState<Map<string, StudentQrStatus>>(new Map())
  const [editing, setEditing] = useState<Student | null | undefined>(undefined)
  const [showImport, setShowImport] = useState(false)
  const [qrModal, setQrModal] = useState<{ credentials: Array<{ studentId: string; credential: string }>; mode: 'issued' | 'viewed' } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('current')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' | 'info' } | null>(null)

  const load = useCallback(async () => {
    try {
      const [studentRows, departmentRows] = await Promise.all([
        listStudents({ includeDeleted: isAdmin }), listDepartments(),
      ])
      setStudents(studentRows)
      setDepartments(departmentRows)
      if (isAdmin) {
        const statuses = await listStudentQrStatuses(studentRows.filter((item) => !item.deleted_at).map((item) => item.id))
        setQrStatuses(new Map(statuses.map((status) => [status.student_id, status])))
      }
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [isAdmin])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return students.filter((student) => {
      if (statusFilter === 'current' && student.deleted_at) return false
      if (statusFilter === 'active' && (student.deleted_at || !student.is_active)) return false
      if (statusFilter === 'inactive' && (student.deleted_at || student.is_active)) return false
      if (statusFilter === 'deleted' && !student.deleted_at) return false
      if (departmentFilter !== 'all' && student.department_id !== departmentFilter) return false
      if (yearFilter !== 'all' && student.year_level !== Number(yearFilter)) return false
      if (needle && !`${student.student_number} ${student.full_name}`.toLowerCase().includes(needle)) return false
      return true
    })
  }, [departmentFilter, search, statusFilter, students, yearFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const save = async (values: StudentInput) => {
    try {
      if (editing) await updateStudent(editing.id, values)
      else await createStudent(values)
      setEditing(undefined)
      setMessage({ text: editing ? 'Student updated.' : 'Student created.', tone: 'success' })
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Student could not be saved.'), tone: 'error' }) }
  }
  const toggleActive = async (student: Student) => {
    try { await setStudentActive(student.id, !student.is_active); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const remove = async (student: Student) => {
    if (!await confirm({ title: 'Delete student?', message: `${student.full_name} will be removed from current records. Attendance history will be preserved.`, confirmLabel: 'Delete student', tone: 'danger' })) return
    try {
      await softDeleteStudent(student.id)
      setSelected((current) => { const next = new Set(current); next.delete(student.id); return next })
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const restore = async (student: Student) => {
    try { await restoreStudent(student.id); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause, 'Student could not be restored.'), tone: 'error' }) }
  }
  const issueOne = async (student: Student) => {
    const verb = qrStatuses.get(student.id)?.has_active_credential ? 'Regenerate' : 'Issue'
    if (!await confirm({ title: `${verb} QR credential?`, message: `${verb === 'Regenerate' ? 'The current credential will be permanently revoked. ' : ''}A new credential will be created for ${student.full_name}.`, confirmLabel: `${verb} credential`, tone: verb === 'Regenerate' ? 'danger' : 'primary' })) return
    setBusy(true)
    try {
      const result = await issueStudentQr(student.id)
      setQrModal({ credentials: [{ studentId: student.id, credential: result.credential }], mode: 'issued' })
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Credential could not be issued.'), tone: 'error' }) }
    finally { setBusy(false) }
  }
  const issueBatch = async () => {
    const ids = [...selected].filter((id) => students.some((student) => student.id === id && !student.deleted_at))
    if (!ids.length) return
    if (!await confirm({ title: 'Issue new QR credentials?', message: `New credentials will be created for ${ids.length} students. Every existing credential in this selection will be revoked.`, confirmLabel: `Issue ${ids.length} credentials`, tone: 'danger' })) return
    setBusy(true)
    try {
      const result = await batchIssueStudentQrs(ids)
      setQrModal({ credentials: result.credentials, mode: 'issued' })
      setSelected(new Set())
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Credential batch could not be issued.'), tone: 'error' }) }
    finally { setBusy(false) }
  }

  const viewQr = async (student: Student) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await viewStudentQr(student.id)
      setQrModal({ credentials: [{ studentId: student.id, credential: result.credential }], mode: 'viewed' })
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The QR credential could not be viewed.'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const selectablePageRows = pageRows.filter((student) => !student.deleted_at)
  const allPageSelected = selectablePageRows.length > 0 && selectablePageRows.every((student) => selected.has(student.id))
  const togglePage = () => setSelected((current) => {
    const next = new Set(current)
    for (const student of selectablePageRows) {
      if (allPageSelected) next.delete(student.id)
      else next.add(student.id)
    }
    return next
  })

  if (loading) return <LoadingScreen />
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Students</h1><p className="page-subtitle">Manage records, imports, and secure QR credentials.</p></div>
        {isAdmin && <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setShowImport(true)}><FileUp size={17} /> Import</button><button className="btn-primary" onClick={() => { setMessage(null); setEditing(null) }}><Plus size={17} /> Add student</button></div>}
      </div>
      {message && <Alert message={message.text} tone={message.tone} />}
      <div className="toolbar">
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search Student ID or name" />
        <select className="field max-w-56" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1) }}><option value="all">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select>
        <select className="field max-w-44" value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setPage(1) }}><option value="all">All year levels</option>{[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}</select>
        {isAdmin && <select className="field max-w-44" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="current">Current records</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="deleted">Deleted</option><option value="all">All records</option></select>}
      </div>
      {isAdmin && selected.size > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><strong className="text-sm text-blue-900">{selected.size} selected</strong><button className="btn-primary" disabled={busy} onClick={() => void issueBatch()}><Printer size={16} /> Issue and print QR batch</button><button className="btn-secondary" onClick={() => setSelected(new Set())}>Clear selection</button></div>}
      <div className="table-wrap">
        <table>
          <thead><tr>{isAdmin && <th><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select current page" /></th>}<th>Student ID</th><th>Full Name</th><th>Year</th><th>Sex</th><th>Department</th><th>Status</th>{isAdmin && <th>QR Credential</th>}{isAdmin && <th>Actions</th>}</tr></thead>
          <tbody>
            {pageRows.map((student) => {
              const qr = qrStatuses.get(student.id)
              return <tr key={student.id} className={student.deleted_at ? 'bg-red-50/50 text-slate-500' : ''}>
                {isAdmin && <td><input type="checkbox" disabled={!!student.deleted_at} checked={selected.has(student.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(student.id)) next.delete(student.id); else next.add(student.id); return next })} aria-label={`Select ${student.full_name}`} /></td>}
                <td className="font-mono">{student.student_number}</td><td className="font-medium">{student.full_name}</td><td>{student.year_level}</td><td>{student.sex}</td><td>{student.departments?.code ?? '—'}</td>
                <td>{student.deleted_at ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-800">Deleted</span> : <span className={`rounded-full px-2 py-1 text-xs ${student.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{student.is_active ? 'Active' : 'Inactive'}</span>}</td>
                {isAdmin && <td>{student.deleted_at ? '—' : qr?.has_active_credential ? <div><span className="text-sm text-emerald-700">Issued</span>{qr.issued_at && <div className="text-xs text-slate-500">{formatManilaDate(qr.issued_at)}</div>}</div> : <span className="text-sm text-slate-500">Not issued</span>}</td>}
                {isAdmin && <td><div className="flex flex-wrap gap-2">{student.deleted_at ? <button className="btn-secondary" onClick={() => void restore(student)}><RotateCcw size={14} /> Restore</button> : <><button className="btn-secondary" onClick={() => setEditing(student)}><Pencil size={14} /> Edit</button><button className="btn-secondary" onClick={() => void toggleActive(student)}>{student.is_active ? 'Deactivate' : 'Activate'}</button>{qr?.has_active_credential && <button className="btn-primary" disabled={busy} onClick={() => void viewQr(student)}><Eye size={14} /> View QR</button>}<button className="btn-secondary" disabled={busy} onClick={() => void issueOne(student)}>{qr?.has_active_credential ? <RotateCcw size={14} /> : <KeyRound size={14} />}{qr?.has_active_credential ? 'Regenerate QR' : 'Issue QR'}</button><button className="btn-danger" onClick={() => void remove(student)} aria-label={`Delete ${student.full_name}`}><Trash2 size={14} /></button></>}</div></td>}
              </tr>
            })}
            {!pageRows.length && <tr><td colSpan={isAdmin ? 10 : 6}><EmptyState compact icon={SearchX} title="No students found" description="Try changing the search or filters." /></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"><span>Showing {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span><div className="flex items-center gap-2"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn-secondary" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
      {editing !== undefined && <StudentFormModal student={editing} departments={departments} error={message?.tone === 'error' ? message.text : null} onClose={() => setEditing(undefined)} onSave={save} />}
      {showImport && <StudentImportModal departments={departments} onClose={() => setShowImport(false)} onImported={load} />}
      {qrModal && <QrCredentialModal students={students} credentials={qrModal.credentials} mode={qrModal.mode} onClose={() => setQrModal(null)} />}
    </div>
  )
}
