import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../components/Modal'
import type { StudentInput } from '../../services/students'
import type { Department, Student } from '../../types/app'

const schema = z.object({
  student_number: z.string().trim().min(1, 'Student ID is required.').max(80),
  full_name: z.string().trim().min(1, 'Full name is required.').max(200),
  year_level: z.number().int().min(1).max(4),
  sex: z.enum(['Male', 'Female']),
  department_id: z.string().uuid('Select a department.'),
  is_active: z.boolean(),
})
type Values = z.infer<typeof schema>

export function StudentFormModal({ student, departments, error, onClose, onSave }: { student: Student | null; departments: Department[]; error?: string | null; onClose: () => void; onSave: (values: StudentInput) => Promise<void> }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: student ? {
      student_number: student.student_number, full_name: student.full_name,
      year_level: student.year_level, sex: student.sex, department_id: student.department_id,
      is_active: student.is_active,
    } : {
      student_number: '', full_name: '', year_level: 1, sex: 'Male',
      department_id: departments[0]?.id ?? '', is_active: true,
    },
  })
  return (
    <Modal title={student ? 'Edit student' : 'Add student'} onClose={onClose} size="md" closeDisabled={isSubmitting}>
      <form className="space-y-4" onSubmit={handleSubmit(onSave)}>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <label className="block"><span className="label">Student ID</span><input className="field" autoFocus {...register('student_number')} />{errors.student_number && <span className="mt-1 block text-xs text-red-700">{errors.student_number.message}</span>}</label>
        <label className="block"><span className="label">Full name</span><input className="field" {...register('full_name')} />{errors.full_name && <span className="mt-1 block text-xs text-red-700">{errors.full_name.message}</span>}</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Year level</span><select className="field" {...register('year_level', { valueAsNumber: true })}>{[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}</select></label>
          <label><span className="label">Sex</span><select className="field" {...register('sex')}><option>Male</option><option>Female</option></select></label>
        </div>
        <label className="block"><span className="label">Department</span><select className="field" {...register('department_id')}>{departments.map((department) => <option key={department.id} value={department.id}>{department.code} — {department.name}</option>)}</select>{errors.department_id && <span className="mt-1 block text-xs text-red-700">{errors.department_id.message}</span>}</label>
        <label className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" {...register('is_active')} /><span><strong className="block text-sm">Active student</strong><span className="text-xs text-slate-500">Inactive students remain available in historical attendance.</span></span></label>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save student'}</button></div>
      </form>
    </Modal>
  )
}
