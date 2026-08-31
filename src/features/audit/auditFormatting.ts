import type { AuditLogRecord } from '../../services/auditLogs'

const ACTION_LABELS: Record<string, string> = {
  audit_logs_deleted: 'Deleted activity records',
  attendance_admin_removed: 'Removed an attendance record',
  attendance_admin_updated: 'Corrected an attendance record',
  attendance_manual_created: 'Added manual attendance',
  attendance_manual_undone: 'Undid manual attendance',
  department_created: 'Added a department',
  department_deleted: 'Deleted a department',
  department_restored: 'Restored a department',
  department_updated: 'Updated a department',
  event_assignment_created: 'Assigned event access',
  event_assignment_removed: 'Removed event access',
  event_closed: 'Closed an event',
  event_created: 'Added an event',
  event_deleted: 'Deleted an event',
  event_opened: 'Opened an event',
  event_pin_reset: 'Reset an event key',
  event_restored: 'Restored an event',
  event_updated: 'Updated an event',
  historical_attendance_recorded: 'Recorded historical attendance',
  force_user_logout: 'Forced a user to sign out',
  password_reset: 'Reset a user password',
  qr_issued: 'Issued a student QR',
  qr_revoked: 'Revoked a student QR',
  student_batch_imported: 'Imported students',
  student_created: 'Added a student',
  student_deleted: 'Deleted a student',
  student_restored: 'Restored a student',
  student_updated: 'Updated a student',
  user_auth_cleanup_failed: 'Encountered a user cleanup issue',
  user_created: 'Created a user',
  user_deleted: 'Deleted a user',
  user_disabled: 'Disabled a user',
  user_enabled: 'Enabled a user',
  user_updated: 'Updated a user',
}

const SENSITIVE_KEY = /(password|pin|credential|token|hash|encrypted|secret)/i

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

function printable(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  const result = String(value)
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(result) ? shortId(result) : result
}

export function auditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? titleCase(action)
}

export function auditRecordLabel(log: AuditLogRecord) {
  const metadata = log.metadata ?? {}
  const department = metadata.code && metadata.name ? `${printable(metadata.code)} · ${printable(metadata.name)}` : ''
  const preferred = department || printable(metadata.student_number) || printable(metadata.name) || printable(metadata.username)
  if (preferred) return preferred
  if (metadata.student_id) return `Student ${printable(metadata.student_id)}`
  if (metadata.user_id) return `User ${printable(metadata.user_id)}`
  return log.entity_id ? `${titleCase(log.entity_type)} ${shortId(log.entity_id)}` : titleCase(log.entity_type)
}

export function auditDetails(log: AuditLogRecord) {
  const metadata = log.metadata ?? {}
  const hidden = new Set(['student_number', 'name', 'code', 'username', 'student_id', 'user_id'])
  const values = Object.entries(metadata)
    .filter(([key]) => !hidden.has(key) && !SENSITIVE_KEY.test(key))
    .slice(0, 4)
    .map(([key, value]) => `${titleCase(key)}: ${printable(value)}`)
  return values.join(' · ') || '—'
}

export function auditActorName(log: AuditLogRecord) {
  return log.profiles?.full_name || log.profiles?.username || 'System'
}

export function auditActorRole(log: AuditLogRecord) {
  return log.profiles?.role ? titleCase(log.profiles.role) : 'Automated'
}
