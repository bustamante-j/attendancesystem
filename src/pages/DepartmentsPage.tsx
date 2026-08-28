import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { Modal } from '../components/Modal'
import { SearchInput } from '../components/SearchInput'
import { friendlyError } from '../lib/errors'
import { createDepartment, listDepartments, restoreDepartment, softDeleteDepartment, updateDepartment } from '../services/departments'
import { listStudents } from '../services/students'
import type { Department, Student } from '../types/app'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(200),
  code: z.string().trim().min(2, 'Code is required.').max(20).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscore, or hyphen.'),
})
type Values = z.infer<typeof schema>

function DepartmentForm({ department, onClose, onSave }: { department: Department | null; onClose: () => void; onSave: (values: Values) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: department ? { name: department.name, code: department.code } : { name: '', code: '' } })
  return <Modal title={department ? 'Edit department' : 'Add department'} onClose={onClose} size="md" closeDisabled={isSubmitting}><form className="space-y-4" onSubmit={handleSubmit(onSave)}><label className="block"><span className="label">Department name</span><input className="field" autoFocus {...register('name')} />{errors.name && <span className="text-xs text-red-700">{errors.name.message}</span>}</label><label className="block"><span className="label">Code</span><input className="field uppercase" {...register('code')} />{errors.code && <span className="text-xs text-red-700">{errors.code.message}</span>}</label><div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save department'}</button></div></form></Modal>
}

export function DepartmentsPage() {
  const confirm = useConfirm()
  const [departments, setDepartments] = useState<Department[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [editing, setEditing] = useState<Department | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)
  const load = useCallback(async () => {
    try {
      const [departmentRows, studentRows] = await Promise.all([listDepartments({ includeDeleted: true }), listStudents({ includeDeleted: true })])
      setDepartments(departmentRows); setStudents(studentRows)
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const visible = useMemo(() => departments.filter((department) => {
    if (!showDeleted && department.deleted_at) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${department.code} ${department.name}`.toLowerCase().includes(needle)
  }), [departments, search, showDeleted])
  const counts = useMemo(() => new Map(departments.map((department) => [department.id, {
    current: students.filter((student) => student.department_id === department.id && !student.deleted_at).length,
    active: students.filter((student) => student.department_id === department.id && !student.deleted_at && student.is_active).length,
  }])), [departments, students])

  const save = async (values: Values) => {
    try {
      if (editing) await updateDepartment(editing.id, values); else await createDepartment(values)
      setEditing(undefined); setMessage({ text: editing ? 'Department updated.' : 'Department created.', tone: 'success' }); await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Department could not be saved.'), tone: 'error' }) }
  }
  const remove = async (department: Department) => {
    if (!await confirm({ title: 'Delete department?', message: `${department.name} can only be deleted when it has no current student records.`, confirmLabel: 'Delete department', tone: 'danger' })) return
    try { await softDeleteDepartment(department.id); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause, 'Move or delete current students before deleting this department.'), tone: 'error' }) }
  }
  const restore = async (department: Department) => {
    try { await restoreDepartment(department.id); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  if (loading) return <LoadingScreen />
  return <div className="space-y-5"><div className="page-header"><div><h1 className="page-title">Departments</h1><p className="page-subtitle">Manage colleges and event audience codes.</p></div><button className="btn-primary" onClick={() => setEditing(null)}><Plus size={17} /> Add department</button></div>{message && <Alert message={message.text} tone={message.tone} />}<div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search name or code" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Show deleted</label></div><div className="table-wrap"><table><thead><tr><th>Code</th><th>Department</th><th>Current Students</th><th>Active Students</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((department) => <tr key={department.id} className={department.deleted_at ? 'bg-red-50/50 text-slate-500' : ''}><td><span className="inline-flex items-center gap-2 font-mono font-semibold"><Building2 size={16} /> {department.code}</span></td><td>{department.name}</td><td>{counts.get(department.id)?.current ?? 0}</td><td>{counts.get(department.id)?.active ?? 0}</td><td>{department.deleted_at ? 'Deleted' : 'Active'}</td><td><div className="flex gap-2">{department.deleted_at ? <button className="btn-secondary" onClick={() => void restore(department)}><RotateCcw size={14} /> Restore</button> : <><button className="btn-secondary" onClick={() => setEditing(department)}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => void remove(department)} aria-label={`Delete ${department.name}`}><Trash2 size={14} /></button></>}</div></td></tr>)}{!visible.length && <tr><td colSpan={6}><EmptyState compact icon={Building2} title="No departments found" description="Try a different search or add a department." /></td></tr>}</tbody></table></div>{editing !== undefined && <DepartmentForm department={editing} onClose={() => setEditing(undefined)} onSave={save} />}</div>
}
