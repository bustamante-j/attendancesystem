import { BarChart3, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface DashboardTotal {
  label: string
  value: number
  color: string
}

export interface DashboardEventMetric {
  name: string
  expected: number
  checkedIn: number
}

const tooltipStyle = {
  borderRadius: 14,
  borderColor: '#cbd5e1',
  boxShadow: '0 14px 36px rgba(15,23,42,0.14)',
}

function shortLabel(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value
}

export function DashboardCharts({ totals, events }: { totals: DashboardTotal[]; events: DashboardEventMetric[] }) {
  const eventData = events.map((event) => ({
    ...event,
    shortName: shortLabel(event.name),
    rate: event.expected ? Math.min(100, Math.round((event.checkedIn / event.expected) * 100)) : 0,
  }))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="panel overflow-hidden">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><BarChart3 size={20} /></span>
          <div><h2 className="font-semibold">Workspace totals</h2><p className="mt-1 text-sm text-slate-500">Current records across Attendly.</p></div>
        </div>
        <div className="mt-5 h-72 min-w-0" role="img" aria-label={totals.map((item) => `${item.label}: ${item.value}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <BarChart data={totals} layout="vertical" margin={{ top: 4, right: 28, left: 16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#cbd5e1" strokeOpacity={0.45} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={102} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#dbeafe', opacity: 0.28 }} contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString(), 'Total']} />
              <Bar dataKey="value" name="Total" radius={[0, 10, 10, 0]} maxBarSize={42}>
                {totals.map((item) => <Cell key={item.label} fill={item.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><TrendingUp size={20} /></span>
          <div><h2 className="font-semibold">Recent event performance</h2><p className="mt-1 text-sm text-slate-500">Expected attendance, check-ins, and completion rate.</p></div>
        </div>
        {eventData.length ? (
          <div className="mt-5 h-72 min-w-0" role="img" aria-label={eventData.map((event) => `${event.name}: ${event.checkedIn} of ${event.expected}, ${event.rate}%`).join('; ')}>
            <ResponsiveContainer width="100%" height="100%" debounce={120}>
              <ComposedChart data={eventData} margin={{ top: 10, right: 8, left: -12, bottom: 10 }}>
                <defs>
                  <linearGradient id="dashboardExpected" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#93c5fd" /><stop offset="100%" stopColor="#dbeafe" /></linearGradient>
                  <linearGradient id="dashboardCheckedIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#6ee7b7" /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#cbd5e1" strokeOpacity={0.45} />
                <XAxis dataKey="shortName" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis yAxisId="count" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} formatter={(value, name) => [name === 'Rate' ? `${value}%` : Number(value).toLocaleString(), name]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar yAxisId="count" dataKey="expected" name="Expected" fill="url(#dashboardExpected)" radius={[7, 7, 0, 0]} maxBarSize={42} />
                <Bar yAxisId="count" dataKey="checkedIn" name="Checked in" fill="url(#dashboardCheckedIn)" radius={[7, 7, 0, 0]} maxBarSize={42} />
                <Line yAxisId="rate" type="monotone" dataKey="rate" name="Rate" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="grid h-72 place-items-center text-sm text-slate-500">Create an event to see attendance performance.</div>}
      </section>
    </div>
  )
}
