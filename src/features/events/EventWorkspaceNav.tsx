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
    { label: 'Attendance roster', to: `/events/${eventRecord.id}/attendance`, icon: ClipboardList, active: active === 'roster' },
    ...(!eventRecord.is_historical ? [{ label: 'Scanner', to: `/events/${eventRecord.id}/scanner`, icon: ScanLine, active: active === 'scanner' }] : []),
    ...(canViewReports ? [{ label: 'Reports', to: `/reports?event=${eventRecord.id}`, icon: BarChart3, active: false }] : []),
  ]

  return (
    <nav className="event-workspace-nav" aria-label={`${eventRecord.name} workspace`}>
      {items.map(({ label, to, icon: Icon, active: isActive }) => (
        <Link
          aria-current={isActive ? 'page' : undefined}
          className={`event-workspace-link ${isActive ? 'event-workspace-link-active' : ''}`}
          key={label}
          to={to}
        >
          <Icon size={16} /> {label}
        </Link>
      ))}
    </nav>
  )
}
