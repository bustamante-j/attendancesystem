import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '../../components/chartTheme'

export interface ReportGroupSummary {
  label: string
  expected: number
  present: number
  late: number
  absent: number
}

export interface ReportAttendanceSummary {
  expected: number
  present: number
  late: number
  absent: number
  rate: number
  checkedOut: number
  outsideAudience: number
}

function SummaryChart({ title, rows }: { title: string; rows: ReportGroupSummary[] }) {
  const chart = useChartTheme()
  const accessibleSummary = rows.map((row) => `${row.label}: ${row.present} present, ${row.late} late, ${row.absent} absent`).join('; ')
  const axisTick = { fill: chart.axis, fontSize: 11 }

  return (
    <section className="table-shell">
      <div className="surface-head">
        <h2 className="section-title">{title}</h2>
        <span className="text-meta text-muted">{rows.length} groups</span>
      </div>
      {rows.length ? (
        <div className="h-72 min-w-0 p-4" role="img" aria-label={`${title}. ${accessibleSummary}`}>
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chart.grid} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={72} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: chart.cursor }}
                contentStyle={chart.tooltip}
                formatter={(value) => Number(value).toLocaleString()}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8, color: chart.axis }} />
              <Bar dataKey="present" name="Present" stackId="attendance" fill={chart.present} radius={[5, 0, 0, 5]} maxBarSize={26} />
              <Bar dataKey="late" name="Late" stackId="attendance" fill={chart.late} maxBarSize={26} />
              <Bar dataKey="absent" name="Absent" stackId="attendance" fill={chart.grid} radius={[0, 5, 5, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="px-4 py-16 text-center text-base text-muted">No summary data.</p>}
    </section>
  )
}

function AttendanceDonut({ expected, present, late, absent, rate, checkedOut, outsideAudience, showCheckedOut }: ReportAttendanceSummary & { showCheckedOut: boolean }) {
  const chart = useChartTheme()
  const segments = [
    { label: 'Present', value: present, color: chart.present },
    { label: 'Late', value: late, color: chart.late },
    { label: 'Absent', value: absent, color: chart.grid },
  ]

  return (
    <section className="table-shell">
      <div className="surface-head"><h2 className="section-title">Attendance overview</h2></div>
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row xl:flex-col">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="label"
                innerRadius={54}
                outerRadius={80}
                cornerRadius={5}
                paddingAngle={segments.some((segment) => segment.value) ? 2 : 0}
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {segments.map((segment) => <Cell key={segment.label} fill={segment.color} />)}
              </Pie>
              <Tooltip contentStyle={chart.tooltip} formatter={(value, name) => [Number(value).toLocaleString(), name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <strong className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{rate}%</strong>
            <span className="text-meta text-muted">attendance</span>
          </div>
        </div>
        <dl className="w-full space-y-2">
          {segments.map((segment) => (
            <div className="flex items-center justify-between gap-4" key={segment.label}>
              <dt className="inline-flex items-center gap-2 text-muted">
                <span className="dot" style={{ backgroundColor: segment.color }} />
                {segment.label}
              </dt>
              <dd className="tabular-nums text-ink">{segment.value.toLocaleString()}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-line pt-2.5">
            <dt className="text-muted">Expected</dt>
            <dd className="tabular-nums text-ink">{expected.toLocaleString()}</dd>
          </div>
          {showCheckedOut && (
            <div className="flex items-center justify-between">
              <dt className="text-muted">Checked out</dt>
              <dd className="tabular-nums text-ink">{checkedOut.toLocaleString()}</dd>
            </div>
          )}
          {outsideAudience > 0 && (
            <div className="flex items-center justify-between text-warn-ink">
              <dt>Outside audience</dt>
              <dd className="tabular-nums">{outsideAudience.toLocaleString()}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}

export function ReportCharts({ summary, departmentSummary, yearSummary, showCheckedOut }: {
  summary: ReportAttendanceSummary
  departmentSummary: ReportGroupSummary[]
  yearSummary: ReportGroupSummary[]
  showCheckedOut: boolean
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <AttendanceDonut {...summary} showCheckedOut={showCheckedOut} />
      <SummaryChart title="By department" rows={departmentSummary} />
      <SummaryChart title="By year level" rows={yearSummary} />
    </div>
  )
}
