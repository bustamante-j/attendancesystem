import type { SheetData } from 'write-excel-file/browser'
import type { AuditLogRecord } from '../../services/auditLogs'
import { formatManilaDate } from '../../utils/dates'
import { auditActionLabel, auditActorName, auditActorRole, auditDetails, auditRecordLabel } from './auditFormatting'

const HEADERS = ['Date and time', 'User', 'Role', 'Action', 'Record type', 'Record', 'Details']

function values(log: AuditLogRecord) {
  return [
    formatManilaDate(log.created_at),
    auditActorName(log),
    auditActorRole(log),
    auditActionLabel(log.action),
    log.entity_type.replace(/_/g, ' '),
    auditRecordLabel(log),
    auditDetails(log),
  ]
}

function filename(extension: string) {
  return `attendly-activity-log-${new Date().toISOString().slice(0, 10)}.${extension}`
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

export function exportAuditLogsCsv(logs: AuditLogRecord[]) {
  const rows = [HEADERS, ...logs.map(values)]
  const contents = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename('csv')
  link.click()
  URL.revokeObjectURL(url)
}

export async function exportAuditLogsExcel(logs: AuditLogRecord[]) {
  const data: SheetData = [
    HEADERS.map((value) => ({
      value,
      fontWeight: 'bold' as const,
      backgroundColor: '#1D4ED8',
      textColor: '#FFFFFF',
      align: 'center' as const,
      wrap: true,
    })),
    ...logs.map(values),
  ]
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(data, {
    columns: [{ width: 23 }, { width: 26 }, { width: 16 }, { width: 30 }, { width: 22 }, { width: 30 }, { width: 48 }],
    stickyRowsCount: 1,
  }).toFile(filename('xlsx'))
}
