import { Building2, CalendarDays, Code2, LayoutDashboard, LogOut, Menu, Users, UserRoundCog, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'

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
        { to: '/users', label: 'Users', icon: UserRoundCog },
        ...(import.meta.env.DEV ? [{ to: '/dev', label: 'Dev Tools', icon: Code2 }] : []),
      ]
    : profile.role === 'faculty'
      ? [
          { to: '/', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/students', label: 'Students', icon: Users },
          { to: '/events', label: 'Events', icon: CalendarDays },
        ]
      : [{ to: '/events', label: 'Assigned Events', icon: CalendarDays }]

  return (
    <div className="min-h-screen md:flex">
      <button className="fixed left-3 top-3 z-30 rounded-md bg-slate-900 p-2 text-white md:hidden" onClick={() => setOpen(!open)}>
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 z-20 w-64 bg-slate-900 text-white transition md:static md:translate-x-0`}>
        <div className="border-b border-slate-700 p-5">
          <div className="text-lg font-bold">Attendly</div>
          <div className="mt-1 text-xs text-slate-400">Attendance Management</div>
        </div>
        <nav className="space-y-1 p-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-700 p-4">
          <div className="truncate text-sm font-medium">{profile.full_name}</div>
          <div className="mb-3 text-xs capitalize text-slate-400">{profile.role.replace('_', ' ')}</div>
          <button className="btn w-full bg-slate-800 text-slate-100 hover:bg-slate-700" onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pt-16 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
