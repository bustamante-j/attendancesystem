import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, RefreshCw, ScrollText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { auditActionLabel, auditActorName, auditActorRole, auditDetails, auditRecordLabel } from '../features/audit/auditFormatting'
import { exportAuditLogsCsv, exportAuditLogsExcel } from '../features/audit/exportAuditLogs'
import { friendlyError } from '../lib/errors'
import { AUDIT_LOG_PAGE_SIZE, listAllAuditLogs, listAuditLogs, type AuditLogRecord } from '../services/auditLogs'
import { formatManilaDate } from '../utils/dates'

const ENTITY_OPTIONS = [
  ['all', 'All activity'],
  ['student', 'Students'],
  ['student_qr_credential', 'Student QR'],
  ['event', 'Events'],
  ['attendance', 'Attendance corrections'],
  ['department', 'Departments'],
  ['user', 'Users'],
] as const

export function ActivityLogPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const filters = useMemo(() => ({ entityType }), [entityType])
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE))
  const from = total ? (page - 1) * AUDIT_LOG_PAGE_SIZE + 1 : 0
  const to = Math.min(page * AUDIT_LOG_PAGE_SIZE, total)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const result = await listAuditLogs(page, filters)
      setLogs(result.rows)
      setTotal(result.total)
    } catch (cause) {
      setMessage(friendlyError(cause, 'Activity could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { void load() }, [load])

  const runExport = async (type: 'csv' | 'xlsx') => {
    setExporting(type)
    setMessage(null)
    try {
      const rows = await listAllAuditLogs(filters)
      if (type === 'csv') exportAuditLogsCsv(rows)
      else await exportAuditLogsExcel(rows)
    } catch (cause) {
      setMessage(friendlyError(cause, 'The activity export could not be created.'))
    } finally {
      setExporting(null)
    }
  }

  if (loading && !logs.length) return <LoadingScreen />

  return <div className="space-y-5">
    <div className="page-header">
      <div><h1 className="page-title">Activity Log</h1><p className="page-subtitle">Review important account, student, event, and administrative actions.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('csv')}><Download size={16} /> {exporting === 'csv' ? 'Preparing…' : 'Export CSV'}</button>
        <button className="btn-primary" disabled={Boolean(exporting)} onClick={() => void runExport('xlsx')}><FileSpreadsheet size={16} /> {exporting === 'xlsx' ? 'Preparing…' : 'Export Excel'}</button>
      </div>
    </div>

    <Alert tone="info" message="Activity is visible only to the Super Admin and is automatically removed after 30 days. Exports include the current activity filter." />
    {message && <Alert message={message} />}

    <div className="toolbar justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="activity-type">Activity type</label>
        <select id="activity-type" className="field min-w-52" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1) }}>
          {ENTITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <button className="btn-secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </div>

    <div className="table-wrap">
      <table>
        <thead><tr><th>Date and time</th><th>User</th><th>Activity</th><th>Record</th><th>Details</th></tr></thead>
        <tbody>
          {logs.map((log) => <tr key={log.id}>
            <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{formatManilaDate(log.created_at)}</td>
            <td><div className="font-medium text-slate-900 dark:text-white">{auditActorName(log)}</div><div className="text-xs text-slate-500">{auditActorRole(log)}</div></td>
            <td><div className="font-medium">{auditActionLabel(log.action)}</div><div className="text-xs capitalize text-slate-500">{log.entity_type.replace(/_/g, ' ')}</div></td>
            <td className="max-w-72 font-medium">{auditRecordLabel(log)}</td>
            <td className="max-w-96 text-xs leading-5 text-slate-500 dark:text-slate-400">{auditDetails(log)}</td>
          </tr>)}
          {!logs.length && <tr><td colSpan={5}><EmptyState compact icon={ScrollText} title="No activity found" description="There is no retained activity for this filter yet." /></td></tr>}
        </tbody>
      </table>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
      <span>Showing {from}–{to} of {total} retained actions</span>
      <div className="flex items-center gap-2">
        <button className="btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} aria-label="Previous activity page"><ChevronLeft size={16} /> Previous</button>
        <span className="min-w-24 text-center font-medium text-slate-700 dark:text-slate-200">Page {page} of {pageCount}</span>
        <button className="btn-secondary" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} aria-label="Next activity page">Next <ChevronRight size={16} /></button>
      </div>
    </div>
  </div>
}
