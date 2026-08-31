import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '../../components/Alert'
import { Modal, ModalActions } from '../../components/Modal'
import type { Profile, UserRole } from '../../types/app'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required.').max(200),
  username: z.string().trim().regex(/^[A-Za-z0-9_.]{3,40}$/, 'Use 3–40 letters, numbers, underscore, or dot.'),
  password: z.string().max(128),
  role: z.enum(['super_admin', 'admin', 'faculty', 'officer']),
})
type Values = z.infer<typeof schema>

export function UserFormModal({ user, currentUserId, error, onClose, onSave }: {
  user: Profile | null
  currentUserId: string
  error?: string | null
  onClose: () => void
  onSave: (values: { full_name: string; username: string; password?: string; role: UserRole }) => Promise<void>
}) {
  const isCurrentUser = user?.id === currentUserId
  const isProtectedSuperAdmin = user?.role === 'super_admin'
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: user
      ? { full_name: user.full_name, username: user.username, password: '', role: user.role }
      : { full_name: '', username: '', password: '', role: 'officer' },
  })

  const submit = async (values: Values) => {
    if (!user && values.password.length < 12) { setError('password', { message: 'Use at least 12 characters.' }); return }
    await onSave({ ...values, username: values.username.toLowerCase(), password: values.password || undefined })
  }

  return (
    <Modal title={user ? 'Edit user' : 'Create user'} onClose={onClose} size="md" closeDisabled={isSubmitting}>
      <form onSubmit={handleSubmit(submit)}>
        <div className="space-y-4">
          {error && <Alert message={error} />}

          <label className="block">
            <span className="label">Full name</span>
            <input className="field" autoFocus {...register('full_name')} />
            {errors.full_name && <span className="field-error">{errors.full_name.message}</span>}
          </label>

          <label className="block">
            <span className="label">Username</span>
            <input className="field" autoComplete="off" {...register('username')} />
            {errors.username && <span className="field-error">{errors.username.message}</span>}
          </label>

          {!user && (
            <div>
              <label className="label" htmlFor="new-user-password">Initial password</label>
              <div className="relative">
                <input
                  id="new-user-password"
                  className="field pr-10"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-subtle transition-colors hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="field-error">{errors.password.message}</span>}
              <span className="mt-1.5 block text-meta text-muted">
                12–128 characters. Never stored in the application database.
              </span>
            </div>
          )}

          <label className="block">
            <span className="label">Role</span>
            {isProtectedSuperAdmin ? (
              <>
                <input type="hidden" {...register('role')} />
                <div className="field cursor-not-allowed bg-sunken text-muted">Super Admin</div>
              </>
            ) : (
              <select className="field" {...register('role')}>
                <option value="admin">Admin</option>
                <option value="faculty">Faculty</option>
                <option value="officer">Officer</option>
              </select>
            )}
            {isProtectedSuperAdmin && <span className="mt-1.5 block text-meta text-muted">The Super Admin role is permanently protected.</span>}
            {!isProtectedSuperAdmin && isCurrentUser && <span className="mt-1.5 block text-meta text-muted">You cannot change your own role.</span>}
          </label>
        </div>

        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  )
}
