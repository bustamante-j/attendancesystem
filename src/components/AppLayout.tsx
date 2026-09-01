import {
  BarChart3,
  Building2,
  CalendarDays,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorDown,
  ScrollText,
  Users,
  UserRoundCog,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { usePwaInstall } from '../features/pwa/usePwaInstall'
import { PaletteToggle, ThemeToggle } from '../features/theme/ThemeProvider'
import { BrandLogo } from './BrandLogo'

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const { canInstall, install } = usePwaInstall()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname])

  if (!profile) return null

  const links = profile.role === 'super_admin'
    ? [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/students', label: 'Students', icon: Users },
        { to: '/events', label: 'Events', icon: CalendarDays },
        { to: '/reports', label: 'Reports', icon: BarChart3 },
        { to: '/departments', label: 'Departments', icon: Building2 },
        { to: '/users', label: 'Users', icon: UserRoundCog },
        { to: '/activity-log', label: 'Activity', icon: ScrollText },
        ...(import.meta.env.DEV ? [{ to: '/dev', label: 'Dev Tools', icon: Code2 }] : []),
      ]
    : profile.role === 'admin'
      ? [
          { to: '/', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/students', label: 'Students', icon: Users },
          { to: '/events', label: 'Events', icon: CalendarDays },
          { to: '/reports', label: 'Reports', icon: BarChart3 },
          { to: '/users', label: 'Users', icon: UserRoundCog },
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
      <header className="fixed inset-x-0 top-0 z-30 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface/90 px-3 backdrop-blur md:hidden">
        <button
          type="button"
          className="icon-btn justify-self-start"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
        <div className="flex items-center gap-2">
          <BrandLogo markOnly className="h-7 w-7" />
          <span className="font-semibold tracking-tight text-ink">Attendly</span>
        </div>
        <div className="flex items-center gap-1 justify-self-end">
          <PaletteToggle />
          <ThemeToggle />
        </div>
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-ink/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Fixed dark brand rail. It keeps its own surface in both themes and stays
          put while the main column scrolls. */}
      <aside
        className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 z-30 flex h-screen w-64 shrink-0 flex-col bg-sidebar transition-transform duration-200 md:sticky md:top-0 md:translate-x-0`}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-line px-4 py-4">
          <BrandLogo markOnly className="h-8 w-8" />
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-tight tracking-tight text-sidebar-ink">Attendly</div>
            <div className="text-meta text-sidebar-muted">Attendance made simple</div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="Main navigation">
          <div className="mb-1.5 px-2.5 text-micro font-semibold uppercase tracking-wider text-sidebar-muted/70">
            Workspace
          </div>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-base transition-colors ${
                isActive
                  ? 'bg-accent font-medium text-accent-contrast'
                  : 'text-sidebar-muted hover:bg-white/[0.07] hover:text-sidebar-ink'
              }`}
            >
              <Icon className="shrink-0" size={17} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-sidebar-line p-2.5">
          {canInstall && (
            <button
              className="btn mb-1.5 w-full justify-start bg-white/[0.07] text-sidebar-ink hover:bg-white/[0.12]"
              onClick={() => void install()}
            >
              <MonitorDown size={16} /> Install app
            </button>
          )}
          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.05] px-2.5 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/25 text-micro font-semibold text-white">
              {initials || 'A'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium text-sidebar-ink">{profile.full_name}</div>
              <div className="truncate text-meta capitalize text-sidebar-muted">{profile.role.replace('_', ' ')}</div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              className="btn flex-1 justify-start text-sidebar-muted hover:bg-white/[0.07] hover:text-sidebar-ink"
              onClick={() => void signOut()}
            >
              <LogOut size={16} /> Sign out
            </button>
            <PaletteToggle className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-white/[0.07] hover:text-sidebar-ink" />
            <ThemeToggle className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-white/[0.07] hover:text-sidebar-ink" />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-12 pt-[4.5rem] sm:px-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-[1360px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
