import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { Alert } from '../components/Alert'
import { BrandLogo } from '../components/BrandLogo'
import { useAuth } from '../features/auth/AuthProvider'
import { PaletteToggle, ThemeToggle } from '../features/theme/ThemeProvider'
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
    <main className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5">
        <PaletteToggle />
        <ThemeToggle />
      </div>

      {/* Quiet brand panel: one statement, no gradients competing with the form. */}
      <section className="relative hidden flex-col justify-between border-r border-line bg-sunken p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <BrandLogo markOnly className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-ink">Attendly</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink">
            Know who is present.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Scan secure QR codes and turn live attendance into clear reports from one workspace.
          </p>
        </div>
        <p className="text-meta text-subtle">Protected staff access</p>
      </section>

      <section className="flex items-center justify-center p-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandLogo markOnly className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight text-ink">Attendly</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-1 text-base text-muted">Sign in to your staff workspace.</p>

          <div className="mt-6 space-y-3">
            {environmentError && <Alert message={environmentError} tone="info" />}
            {error && <Alert message={error} />}
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit(submit)}>
            <label className="block">
              <span className="label">Username</span>
              <input className="field" autoComplete="username" autoFocus {...register('username')} />
              {errors.username && <span className="field-error">{errors.username.message}</span>}
            </label>

            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  className="field pr-10"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
            </div>

            <button className="btn-primary min-h-10 w-full" disabled={isSubmitting || !!environmentError}>
              <LogIn size={16} /> {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-meta text-subtle">Staff accounts only. Students do not need accounts.</p>
        </div>
      </section>
    </main>
  )
}
