import { BarChart3, PieChart as PieChartIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

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
  const accessibleSummary = rows.map((row) => `${row.label}: ${row.present} present, ${row.late} late, ${row.absent} absent`).join('; ')
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BarChart3 className="text-blue-600" size={18} /><h2 className="font-semibold">{title}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{rows.length} groups</span></div>
      {rows.length ? (
        <div className="mt-4 h-72 min-w-0" role="img" aria-label={`${title}. ${accessibleSummary}`}>
          <ResponsiveContainer width="100%" height="100%" debounce={120}>
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`${title.replaceAll(' ', '-')}-present`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#34d399" /></linearGradient>
                <linearGradient id={`${title.replaceAll(' ', '-')}-late`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#d97706" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#cbd5e1" strokeOpacity={0.45} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={72} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#dbeafe', opacity: 0.25 }} contentStyle={{ borderRadius: 14, borderColor: '#cbd5e1', boxShadow: '0 14px 36px rgba(15,23,42,0.14)' }} formatter={(value) => Number(value).toLocaleString()} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="present" name="Present" stackId="attendance" fill={`url(#${title.replaceAll(' ', '-')}-present)`} radius={[7, 0, 0, 7]} maxBarSize={34} />
              <Bar dataKey="late" name="Late" stackId="attendance" fill={`url(#${title.replaceAll(' ', '-')}-late)`} maxBarSize={34} />
              <Bar dataKey="absent" name="Absent" stackId="attendance" fill="#94a3b8" radius={[0, 7, 7, 0]} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="py-8 text-center text-sm text-slate-500">No summary data.</p>}
    </section>
  )
}

function AttendanceDonut({ expected, present, late, absent, rate, checkedOut, outsideAudience, showCheckedOut }: ReportAttendanceSummary & { showCheckedOut: boolean }) {
  const segments = [
    { label: 'Present', value: present, color: '#10b981', text: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Late', value: late, color: '#f59e0b', text: 'text-amber-600 dark:text-amber-400' },
    { label: 'Absent', value: absent, color: '#94a3b8', text: 'text-slate-500 dark:text-slate-400' },
  ]
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2"><PieChartIcon size={18} /><h2 className="font-semibold">Attendance overview</h2></div>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row xl:flex-col">
        <div className="relative h-48 w-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%" debounce={120}><PieChart><Pie data={segments} dataKey="value" nameKey="label" innerRadius={57} outerRadius={86} cornerRadius={7} paddingAngle={segments.some((segment) => segment.value) ? 3 : 0} startAngle={90} endAngle={-270} stroke="none">{segments.map((segment) => <Cell key={segment.label} fill={segment.color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 14, borderColor: '#cbd5e1', boxShadow: '0 14px 36px rgba(15,23,42,0.14)' }} formatter={(value, name) => [Number(value).toLocaleString(), name]} /></PieChart></ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl tracking-tight">{rate}%</strong><span className="text-xs text-slate-500">attendance</span></div>
        </div>
        <div className="w-full space-y-2">
          {segments.map((segment) => <div className="flex items-center justify-between gap-4 text-sm" key={segment.label}><span className={`inline-flex items-center gap-2 font-medium ${segment.text}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label}</span><strong className="tabular-nums">{segment.value.toLocaleString()}</strong></div>)}
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="text-slate-500">Expected</span><strong>{expected.toLocaleString()}</strong></div>
          {showCheckedOut && <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Checked out</span><strong>{checkedOut.toLocaleString()}</strong></div>}
          {outsideAudience > 0 && <div className="flex items-center justify-between text-sm text-amber-700 dark:text-amber-300"><span>Outside audience</span><strong>{outsideAudience.toLocaleString()}</strong></div>}
        </div>
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
      <SummaryChart title="Department summary" rows={departmentSummary} />
      <SummaryChart title="Year-level summary" rows={yearSummary} />
    </div>
  )
}
