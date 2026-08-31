import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { Modal, ModalActions } from '../components/Modal'
import { SearchInput } from '../components/SearchInput'
import { StatusBadge } from '../components/StatusBadge'
import { friendlyError } from '../lib/errors'
import { createDepartment, listDepartments, restoreDepartment, softDeleteDepartment, updateDepartment } from '../services/departments'
import { listStudents } from '../services/students'
import type { Department, Student } from '../types/app'

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(200),
  code: z.string().trim().min(2, 'Code is required.').max(20).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscore, or hyphen.'),
})
type Values = z.infer<typeof schema>

function DepartmentForm({ department, onClose, onSave }: {
  department: Department | null
  onClose: () => void
  onSave: (values: Values) => Promise<void>
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: department ? { name: department.name, code: department.code } : { name: '', code: '' },
  })
  return (
    <Modal title={department ? 'Edit department' : 'Add department'} onClose={onClose} size="sm" closeDisabled={isSubmitting}>
      <form onSubmit={handleSubmit(onSave)}>
        <div className="space-y-4">
          <label className="block">
            <span className="label">Department name</span>
            <input className="field" autoFocus {...register('name')} />
            {errors.name && <span className="field-error">{errors.name.message}</span>}
          </label>
          <label className="block">
            <span className="label">Code</span>
            <input className="field uppercase" {...register('code')} />
            {errors.code && <span className="field-error">{errors.code.message}</span>}
          </label>
        </div>
        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save department'}</button>
        </ModalActions>
      </form>
    </Modal>
  )
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
      const [departmentRows, studentRows] = await Promise.all([
        listDepartments({ includeDeleted: true }),
        listStudents({ includeDeleted: true }),
      ])
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
      setEditing(undefined)
      setMessage({ text: editing ? 'Department updated.' : 'Department created.', tone: 'success' })
      await load()
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-subtitle">Colleges and event audience codes.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}><Plus size={15} /> Add department</button>
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or code" />
        <label className="flex items-center gap-2 px-1 text-base text-muted">
          <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
          Show deleted
        </label>
      </div>

      <div className="table-shell">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Current students</th>
                <th>Active students</th>
                <th>Status</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((department) => {
                const deleted = !!department.deleted_at
                return (
                  <tr key={department.id} className={deleted ? 'opacity-60' : ''}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Building2 className="shrink-0 text-subtle" size={16} strokeWidth={1.9} />
                        <div className="min-w-0">
                          <div className="cell-title font-mono">{department.code}</div>
                          <div className="cell-meta truncate">{department.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="tabular-nums">{counts.get(department.id)?.current ?? 0}</td>
                    <td className="tabular-nums">{counts.get(department.id)?.active ?? 0}</td>
                    <td>
                      <StatusBadge tone={deleted ? 'bad' : 'ok'}>{deleted ? 'Deleted' : 'Active'}</StatusBadge>
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <ActionMenu
                          label={`Actions for ${department.name}`}
                          items={[
                            deleted && { icon: RotateCcw, label: 'Restore department', onSelect: () => void restore(department) },
                            !deleted && { icon: Pencil, label: 'Edit department', onSelect: () => setEditing(department) },
                            !deleted && 'separator',
                            !deleted && { icon: Trash2, label: 'Delete department', danger: true, onSelect: () => void remove(department) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState compact icon={Building2} title="No departments found" description="Try a different search or add a department." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && <DepartmentForm department={editing} onClose={() => setEditing(undefined)} onSave={save} />}
    </div>
  )
}
