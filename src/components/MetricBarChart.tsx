import { BarChart3 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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
  return (
    <section className="panel" aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><BarChart3 size={20} /></span>
        <div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>
      </div>
      <div className="mt-5 h-72 w-full min-w-0" role="img" aria-label={items.map((item) => `${item.label}: ${item.value}`).join(', ')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.55} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} width={42} />
            <Tooltip cursor={{ fill: '#dbeafe', opacity: 0.35 }} contentStyle={{ borderRadius: 12, borderColor: '#cbd5e1', boxShadow: '0 10px 30px rgba(15,23,42,0.12)' }} formatter={(value) => [Number(value).toLocaleString(), 'Total']} />
            <Bar dataKey="value" name="Total" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={72}>{items.map((item) => <Cell key={item.label} fill={item.color ?? '#2563eb'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
