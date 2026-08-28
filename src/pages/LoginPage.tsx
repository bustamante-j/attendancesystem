import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LogIn, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '../components/Alert'
import { useAuth } from '../features/auth/AuthProvider'
import { ThemeToggle } from '../features/theme/ThemeProvider'
import { friendlyError } from '../lib/errors'
import { environmentError } from '../lib/supabase'

const schema = z.object({
  username: z.string().trim().min(3, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
})
type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { session, profile, signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({ resolver: zodResolver(schema) })
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
    <main className="relative grid min-h-screen overflow-hidden bg-slate-50 lg:grid-cols-[1.05fr_0.95fr] dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6"><ThemeToggle compact /></div>

      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.3),transparent_32%),radial-gradient(circle_at_85%_85%,rgba(79,70,229,0.22),transparent_30%)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 shadow-xl shadow-blue-600/30"><ScanLine size={24} /></span>
          <span className="text-xl font-bold tracking-tight">Attendly</span>
        </div>
        <div className="relative max-w-xl">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold text-blue-200">
            <Sparkles size={14} /> Modern attendance operations
          </span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">Know who is present.<br />Right when it matters.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">Manage students, scan secure QR codes, and turn live attendance into clear reports from one focused workspace.</p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-slate-400"><ShieldCheck size={17} className="text-emerald-400" /> Protected staff access</div>
      </section>

      <section className="relative flex items-center justify-center p-4 py-20 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/25"><ScanLine size={22} /></span>
            <div><div className="text-lg font-bold tracking-tight">Attendly</div><div className="text-xs text-slate-500">Attendance made simple</div></div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20">
            <div className="mb-7">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Welcome back</h2>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Sign in to your Attendly staff workspace.</p>
            </div>
            {environmentError && <div className="mb-4"><Alert message={environmentError} tone="info" /></div>}
            {error && <div className="mb-4"><Alert message={error} /></div>}
            <form className="space-y-5" onSubmit={handleSubmit(submit)}>
              <label className="block">
                <span className="label">Username</span>
                <input className="field" autoComplete="username" autoFocus {...register('username')} />
                {errors.username && <span className="mt-1.5 block text-xs text-red-700 dark:text-red-400">{errors.username.message}</span>}
              </label>
              <div>
                <label className="label" htmlFor="login-password">Password</label>
                <div className="relative">
                  <input id="login-password" className="field pr-11" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} />
                  <button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <span className="mt-1.5 block text-xs text-red-700 dark:text-red-400">{errors.password.message}</span>}
              </div>
              <button className="btn-primary w-full py-3" disabled={isSubmitting || !!environmentError}>
                <LogIn size={17} /> {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">Staff accounts only. Students do not need accounts.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
