import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal, ModalActions } from '../../components/Modal'
import type { Profile } from '../../types/app'

const schema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
  confirm: z.string(),
}).refine((values) => values.password === values.confirm, { path: ['confirm'], message: 'Passwords do not match.' })
type Values = z.infer<typeof schema>

export function ResetPasswordModal({ user, onClose, onReset }: {
  user: Profile
  onClose: () => void
  onReset: (password: string) => Promise<void>
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  return (
    <Modal title="Reset password" description={user.username} onClose={onClose} size="sm" closeDisabled={isSubmitting}>
      <form onSubmit={handleSubmit((values) => onReset(values.password))}>
        <div className="space-y-4">
          <label className="block">
            <span className="label">New password</span>
            <input className="field" type="password" autoComplete="new-password" autoFocus {...register('password')} />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </label>
          <label className="block">
            <span className="label">Confirm password</span>
            <input className="field" type="password" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <span className="field-error">{errors.confirm.message}</span>}
          </label>
        </div>
        <ModalActions>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Resetting…' : 'Reset password'}</button>
        </ModalActions>
      </form>
    </Modal>
  )
}
