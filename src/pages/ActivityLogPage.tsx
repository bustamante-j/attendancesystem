import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, RefreshCw, ScrollText, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { auditActionLabel, auditActorName, auditActorRole, auditDetails, auditRecordLabel } from '../features/audit/auditFormatting'
import { exportAuditLogsCsv, exportAuditLogsExcel } from '../features/audit/exportAuditLogs'
import { friendlyError } from '../lib/errors'
import { AUDIT_LOG_PAGE_SIZE, deleteAuditLogs, listAllAuditLogs, listAuditLogs, type AuditLogRecord } from '../services/auditLogs'
import { formatManilaDate } from '../utils/dates'

const ENTITY_OPTIONS = [
  ['all', 'All activity'],
  ['student', 'Students'],
  ['student_qr_credential', 'Student QR'],
  ['event', 'Events'],
  ['attendance', 'Attendance corrections'],
  ['department', 'Departments'],
  ['user', 'Users'],
  ['audit_log', 'Activity log changes'],
] as const

export function ActivityLogPage() {
  const confirm = useConfirm()
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [entityType, setEntityType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)
  const requestRef = useRef(0)

  const filters = useMemo(() => ({ entityType }), [entityType])
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE))
  const from = total ? (page - 1) * AUDIT_LOG_PAGE_SIZE + 1 : 0
  const to = Math.min(page * AUDIT_LOG_PAGE_SIZE, total)

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const result = await listAuditLogs(page, filters)
      if (requestId !== requestRef.current) return
      setLogs(result.rows)
      setTotal(result.total)
    } catch (cause) {
      if (requestId === requestRef.current) setMessage({ text: friendlyError(cause, 'Activity could not be loaded.'), tone: 'error' })
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setSelected(new Set()) }, [entityType, page])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  const allPageSelected = Boolean(logs.length) && logs.every((log) => selected.has(log.id))
  const togglePage = () => setSelected(allPageSelected ? new Set() : new Set(logs.map((log) => log.id)))
  const toggleLog = (id: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const removeSelected = async () => {
    if (!selected.size || !await confirm({
      title: `Delete ${selected.size} activity record${selected.size === 1 ? '' : 's'}?`,
      message: 'The selected records will be permanently removed. This deletion will be retained as a new accountability entry.',
      confirmLabel: 'Delete selected',
      tone: 'danger',
    })) return
    setDeleting(true)
    setMessage(null)
    try {
      const removed = await deleteAuditLogs([...selected])
      setSelected(new Set())
      if (removed >= logs.length && page > 1) setPage((value) => value - 1)
      else await load()
      setMessage({ text: `${removed} activity record${removed === 1 ? '' : 's'} deleted.`, tone: 'success' })
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The selected activity could not be deleted.'), tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const runExport = async (type: 'csv' | 'xlsx') => {
    setExporting(type)
    setMessage(null)
    try {
      const rows = await listAllAuditLogs(filters)
      if (type === 'csv') exportAuditLogsCsv(rows)
      else await exportAuditLogsExcel(rows)
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The activity export could not be created.'), tone: 'error' })
    } finally {
      setExporting(null)
    }
  }

  if (loading && !logs.length) return <LoadingScreen />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Account, student, event, and administrative changes. Retained 30 days.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('csv')}>
            <Download size={15} /> {exporting === 'csv' ? 'Preparing…' : 'CSV'}
          </button>
          <button className="btn-secondary" disabled={Boolean(exporting)} onClick={() => void runExport('xlsx')}>
            <FileSpreadsheet size={15} /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}
          </button>
        </div>
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <div className="filter-bar justify-between">
        <div className="flex items-center gap-2">
          <label className="text-base text-muted" htmlFor="activity-type">Show</label>
          <select
            id="activity-type"
            className="field w-auto min-w-48"
            value={entityType}
            onChange={(event) => { setEntityType(event.target.value); setPage(1) }}
          >
            {ENTITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-base text-muted">{selected.size} selected</span>
              <button className="btn-danger btn-sm" disabled={deleting} onClick={() => void removeSelected()}>
                <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
          <button className="icon-btn" disabled={loading} onClick={() => void load()} aria-label="Refresh activity">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="table-shell">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="w-10">
                  <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all activity on this page" />
                </th>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(log.id)}
                      onChange={() => toggleLog(log.id)}
                      aria-label={`Select ${auditActionLabel(log.action)} by ${auditActorName(log)}`}
                    />
                  </td>
                  <td className="whitespace-nowrap align-top text-muted">{formatManilaDate(log.created_at)}</td>
                  <td className="align-top">
                    <div className="cell-title">{auditActorName(log)}</div>
                    <div className="cell-meta">{auditActorRole(log)}</div>
                  </td>
                  <td className="align-top">
                    <div className="text-ink">{auditActionLabel(log.action)}</div>
                    <div className="cell-meta capitalize">{log.entity_type.replace(/_/g, ' ')}</div>
                  </td>
                  <td className="max-w-md align-top">
                    <div className="text-ink">{auditRecordLabel(log)}</div>
                    <div className="cell-meta leading-relaxed">{auditDetails(log)}</div>
                  </td>
                </tr>
              ))}
              {!logs.length && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState compact icon={ScrollText} title="No activity found" description="There is no retained activity for this filter yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>{from}–{to} of {total.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="tabular-nums">Page {page} of {pageCount}</span>
            <button className="btn-secondary btn-sm" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
