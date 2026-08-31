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
import { useChartTheme } from './chartTheme'

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

function shortLabel(value: string) {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value
}

export function DashboardCharts({ totals, events }: { totals: DashboardTotal[]; events: DashboardEventMetric[] }) {
  const chart = useChartTheme()
  const eventData = events.map((event) => ({
    ...event,
    shortName: shortLabel(event.name),
    rate: event.expected ? Math.min(100, Math.round((event.checkedIn / event.expected) * 100)) : 0,
  }))
  const axisTick = { fill: chart.axis, fontSize: 11 }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="table-shell">
        <div className="surface-head">
          <div>
            <h2 className="section-title">Workspace totals</h2>
            <p className="section-note">Current records across Attendly.</p>
          </div>
        </div>
        <div className="h-72 min-w-0 p-4" role="img" aria-label={totals.map((item) => `${item.label}: ${item.value}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <BarChart data={totals} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={104} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: chart.cursor }}
                contentStyle={chart.tooltip}
                formatter={(value) => [Number(value).toLocaleString(), 'Total']}
              />
              <Bar dataKey="value" name="Total" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {totals.map((item) => <Cell key={item.label} fill={item.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="table-shell">
        <div className="surface-head">
          <div>
            <h2 className="section-title">Recent event performance</h2>
            <p className="section-note">Expected attendance, check-ins, and completion rate.</p>
          </div>
        </div>
        {eventData.length ? (
          <div
            className="h-72 min-w-0 p-4"
            role="img"
            aria-label={eventData.map((event) => `${event.name}: ${event.checkedIn} of ${event.expected}, ${event.rate}%`).join('; ')}
          >
            <ResponsiveContainer width="100%" height="100%" debounce={120}>
              <ComposedChart data={eventData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid} />
                <XAxis dataKey="shortName" tick={axisTick} axisLine={false} tickLine={false} interval={0} />
                <YAxis yAxisId="count" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor }}
                  contentStyle={chart.tooltip}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                  formatter={(value, name) => [name === 'Rate' ? `${value}%` : Number(value).toLocaleString(), name]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8, color: chart.axis }} />
                <Bar yAxisId="count" dataKey="expected" name="Expected" fill={chart.grid} radius={[5, 5, 0, 0]} maxBarSize={34} />
                <Bar yAxisId="count" dataKey="checkedIn" name="Checked in" fill={chart.accent} radius={[5, 5, 0, 0]} maxBarSize={34} />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="rate"
                  name="Rate"
                  stroke={chart.present}
                  strokeWidth={2}
                  dot={{ r: 3, fill: chart.present, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="px-4 py-16 text-center text-base text-muted">Create an event to see attendance performance.</p>
        )}
      </section>
    </div>
  )
}
