import {
  BarChart3,
  Building2,
  CalendarDays,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  UserRoundCog,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { ThemeToggle } from '../features/theme/ThemeProvider'
import { BrandLogo } from './BrandLogo'

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  if (!profile) return null

  const links = profile.role === 'super_admin'
    ? [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/students', label: 'Students', icon: Users },
        { to: '/departments', label: 'Departments', icon: Building2 },
        { to: '/events', label: 'Events', icon: CalendarDays },
        { to: '/reports', label: 'Reports', icon: BarChart3 },
        { to: '/users', label: 'Users', icon: UserRoundCog },
        ...(import.meta.env.DEV ? [{ to: '/dev', label: 'Dev Tools', icon: Code2 }] : []),
      ]
    : profile.role === 'faculty'
      ? [
          { to: '/', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/students', label: 'Students', icon: Users },
          { to: '/events', label: 'Events', icon: CalendarDays },
          { to: '/reports', label: 'Reports', icon: BarChart3 },
        ]
      : [{ to: '/events', label: 'Assigned Events', icon: CalendarDays }]

  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-screen md:flex">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 shadow-sm backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/90">
        <button
          type="button"
          className="icon-btn"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2.5">
          <BrandLogo markOnly className="h-9 w-9" />
          <span className="font-bold tracking-tight text-slate-950 dark:text-white">Attendly</span>
        </div>
        <ThemeToggle compact />
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-10 bg-slate-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 z-20 flex h-screen w-72 shrink-0 flex-col bg-slate-950 text-white shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 md:shadow-none`}>
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
          <BrandLogo markOnly className="h-11 w-11" />
          <div>
            <div className="text-lg font-bold tracking-tight">Attendly</div>
            <div className="text-xs text-slate-400">Attendance made simple</div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Main navigation">
          <div className="mb-2 px-3 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Workspace</div>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon size={18} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
              {initials || 'A'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{profile.full_name}</div>
              <div className="truncate text-xs capitalize text-slate-400">{profile.role.replace('_', ' ')}</div>
            </div>
            <ThemeToggle compact darkSurface />
          </div>
          <button className="btn w-full border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-8 pt-20 sm:px-6 md:p-8 lg:p-10">
        <div className="mx-auto w-full max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
