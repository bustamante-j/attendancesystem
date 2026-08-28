import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '../components/Alert'
import { useAuth } from '../features/auth/AuthProvider'
import { environmentError } from '../lib/supabase'
import { friendlyError } from '../lib/errors'

const schema = z.object({
  username: z.string().trim().min(3, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
})
type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { session, profile, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(schema),
  })
  if (session && profile) return <Navigate to={profile.role === 'officer' ? '/events' : '/'} replace />

  const submit = async (values: LoginValues) => {
    setError(null)
    try {
      await signIn(values.username, values.password)
    } catch (cause) {
      setError(friendlyError(cause, 'Sign in failed.'))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Attendly</h1>
          <p className="mt-1 text-sm text-slate-500">Attendance management, made simple.</p>
        </div>
        {environmentError && <div className="mb-4"><Alert message={environmentError} tone="info" /></div>}
        {error && <div className="mb-4"><Alert message={error} /></div>}
        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <label className="block">
            <span className="label">Username</span>
            <input className="field" autoComplete="username" {...register('username')} />
            {errors.username && <span className="mt-1 block text-xs text-red-700">{errors.username.message}</span>}
          </label>
          <div>
            <label className="label" htmlFor="login-password">Password</label>
            <div className="relative">
              <input id="login-password" className="field pr-11" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
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
            {errors.password && <span className="mt-1 block text-xs text-red-700">{errors.password.message}</span>}
          </div>
          <button className="btn-primary w-full" disabled={isSubmitting || !!environmentError}>
            <LogIn size={17} /> {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">Staff accounts only. Student accounts are not used.</p>
      </div>
    </main>
  )
}
