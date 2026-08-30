import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../components/Modal'
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
    defaultValues: user ? { full_name: user.full_name, username: user.username, password: '', role: user.role } : { full_name: '', username: '', password: '', role: 'officer' },
  })
  const submit = async (values: Values) => {
    if (!user && values.password.length < 12) { setError('password', { message: 'Use at least 12 characters.' }); return }
    await onSave({ ...values, username: values.username.toLowerCase(), password: values.password || undefined })
  }
  return (
    <Modal title={user ? 'Edit user' : 'Create user'} onClose={onClose} size="md" closeDisabled={isSubmitting}>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <label className="block">
          <span className="label">Full name</span>
          <input className="field" autoFocus {...register('full_name')} />
          {errors.full_name && <span className="text-xs text-red-700">{errors.full_name.message}</span>}
        </label>
        <label className="block">
          <span className="label">Username</span>
          <input className="field" autoComplete="off" {...register('username')} />
          {errors.username && <span className="text-xs text-red-700">{errors.username.message}</span>}
        </label>
        {!user && (
          <div>
            <label className="label" htmlFor="new-user-password">Initial password</label>
            <div className="relative">
              <input id="new-user-password" className="field pr-11" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('password')} />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <span className="text-xs text-red-700">{errors.password.message}</span>}
            <span className="mt-1 block text-xs text-slate-500">12–128 characters. The password is never stored in the application database.</span>
          </div>
        )}
        <label className="block">
          <span className="label">Role</span>
          {isProtectedSuperAdmin ? <><input type="hidden" {...register('role')} /><div className="field cursor-not-allowed bg-slate-50 text-slate-500 dark:bg-slate-800">Super Admin</div></> : <select className="field" {...register('role')}><option value="admin">Admin</option><option value="faculty">Faculty</option><option value="officer">Officer</option></select>}
          {isProtectedSuperAdmin && <span className="mt-1 block text-xs text-slate-500">The Super Admin role is permanently protected.</span>}
          {!isProtectedSuperAdmin && isCurrentUser && <span className="mt-1 block text-xs text-slate-500">You cannot change your own role.</span>}
        </label>
        <div className="flex justify-end gap-3 border-t pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  )
}
