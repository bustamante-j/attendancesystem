import { BarChart3, CalendarDays, ClipboardList, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EventRecord } from '../../types/app'

export function EventWorkspaceNav({ eventRecord, active, canViewReports }: {
  eventRecord: EventRecord
  active: 'roster' | 'scanner'
  canViewReports: boolean
}) {
  const items = [
    { label: 'All events', to: '/events', icon: CalendarDays, active: false },
    { label: 'Roster', to: `/events/${eventRecord.id}/attendance`, icon: ClipboardList, active: active === 'roster' },
    ...(!eventRecord.is_historical ? [{ label: 'Scanner', to: `/events/${eventRecord.id}/scanner`, icon: ScanLine, active: active === 'scanner' }] : []),
    ...(canViewReports ? [{ label: 'Reports', to: `/reports?event=${eventRecord.id}`, icon: BarChart3, active: false }] : []),
  ]

  return (
    <nav className="tabs" aria-label={`${eventRecord.name} workspace`}>
      {items.map(({ label, to, icon: Icon, active: isActive }) => (
        <Link
          key={label}
          to={to}
          aria-current={isActive ? 'page' : undefined}
          className={`tab inline-flex items-center gap-2 ${isActive ? 'tab-active' : ''}`}
        >
          <Icon size={15} className={isActive ? 'text-accent' : 'text-subtle'} strokeWidth={1.9} />
          {label}
        </Link>
      ))}
    </nav>
  )
}
