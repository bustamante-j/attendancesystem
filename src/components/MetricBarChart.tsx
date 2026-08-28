import { BarChart3 } from 'lucide-react'

export interface MetricBarItem {
  label: string
  value: number
  color?: string
}

export function MetricBarChart({ title, description, items }: {
  title: string
  description?: string
  items: MetricBarItem[]
}) {
  const maximum = Math.max(...items.map((item) => item.value), 1)

  return (
    <section className="panel" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><BarChart3 size={20} /></span>
        <div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      </div>
      <div className="mt-6 space-y-4">
        {items.map((item) => {
          const width = item.value ? Math.max(3, (item.value / maximum) * 100) : 0
          return (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span className="font-medium text-slate-700 dark:text-slate-300">{item.label}</span><span className="font-bold tabular-nums">{item.value.toLocaleString()}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full transition-[width] duration-500 ${item.color ?? 'bg-blue-600'}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
