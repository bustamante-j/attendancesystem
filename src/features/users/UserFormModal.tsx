import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../components/Modal'
import type { Profile, UserRole } from '../../types/app'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required.').max(200),
  username: z.string().trim().regex(/^[A-Za-z0-9_.]{3,40}$/, 'Use 3–40 letters, numbers, underscore, or dot.'),
  password: z.string().max(128),
  role: z.enum(['super_admin', 'faculty', 'officer']),
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
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: user ? { full_name: user.full_name, username: user.username, password: '', role: user.role } : { full_name: '', username: '', password: '', role: 'officer' },
  })
  const submit = async (values: Values) => {
    if (!user && values.password.length < 12) { setError('password', { message: 'Use at least 12 characters.' }); return }
    await onSave({ ...values, username: values.username.toLowerCase(), password: values.password || undefined })
  }
  return <Modal title={user ? 'Edit user' : 'Create user'} onClose={onClose} size="md" closeDisabled={isSubmitting}><form className="space-y-4" onSubmit={handleSubmit(submit)}>{error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}<label className="block"><span className="label">Full name</span><input className="field" autoFocus {...register('full_name')} />{errors.full_name && <span className="text-xs text-red-700">{errors.full_name.message}</span>}</label><label className="block"><span className="label">Username</span><input className="field" autoComplete="off" {...register('username')} />{errors.username && <span className="text-xs text-red-700">{errors.username.message}</span>}</label>{!user && <label className="block"><span className="label">Initial password</span><input className="field" type="password" autoComplete="new-password" {...register('password')} />{errors.password && <span className="text-xs text-red-700">{errors.password.message}</span>}<span className="mt-1 block text-xs text-slate-500">12–128 characters. The password is never stored in the application database.</span></label>}<label className="block"><span className="label">Role</span><select className="field" {...register('role')}><option value="super_admin">Super Admin</option>{!isCurrentUser && <><option value="faculty">Faculty</option><option value="officer">Officer</option></>}</select>{isCurrentUser && <span className="mt-1 block text-xs text-slate-500">You cannot remove your own Super Admin role.</span>}</label><div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button></div></form></Modal>
}
