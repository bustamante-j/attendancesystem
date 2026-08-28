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
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'panel min-h-64 py-12'}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icon size={23} /></div>
      <h3 className="mt-4 font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
