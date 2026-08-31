import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, description, action, compact = false }: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? 'py-10' : 'surface min-h-64 py-16'}`}>
      <Icon className="text-subtle" size={22} strokeWidth={1.75} />
      <h3 className="mt-3 text-base font-medium text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-base text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
