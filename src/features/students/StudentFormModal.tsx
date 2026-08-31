import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '../../components/Alert'
import { Modal, ModalActions } from '../../components/Modal'
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

export function StudentFormModal({ student, departments, error, onClose, onSave }: {
  student: Student | null
  departments: Department[]
  error?: string | null
  onClose: () => void
  onSave: (values: StudentInput) => Promise<void>
}) {
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
      <form onSubmit={handleSubmit(onSave)}>
        <div className="space-y-4">
          {error && <Alert message={error} />}

          <label className="block">
            <span className="label">Student ID</span>
            <input className="field" autoFocus {...register('student_number')} />
            {errors.student_number && <span className="field-error">{errors.student_number.message}</span>}
          </label>

          <label className="block">
            <span className="label">Full name</span>
            <input className="field" {...register('full_name')} />
            {errors.full_name && <span className="field-error">{errors.full_name.message}</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Year level</span>
              <select className="field" {...register('year_level', { valueAsNumber: true })}>
                {[1, 2, 3, 4].map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Sex</span>
              <select className="field" {...register('sex')}>
                <option>Male</option>
                <option>Female</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="label">Department</span>
            <select className="field" {...register('department_id')}>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.code} — {department.name}</option>)}
            </select>
            {errors.department_id && <span className="field-error">{errors.department_id.message}</span>}
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-line p-3">
            <input className="mt-0.5" type="checkbox" {...register('is_active')} />
            <span>
              <span className="block font-medium text-ink">Active student</span>
              <span className="text-meta text-muted">Inactive students remain available in historical attendance.</span>
            </span>
          </label>
        </div>

        <ModalActions>
          <button className="btn-secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save student'}</button>
        </ModalActions>
      </form>
    </Modal>
  )
}
