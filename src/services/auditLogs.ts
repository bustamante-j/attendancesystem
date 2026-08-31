import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/app'

export const AUDIT_LOG_PAGE_SIZE = 50
const EXPORT_BATCH_SIZE = 500

export interface AuditLogRecord {
  id: string
  actor_user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  profiles: {
    full_name: string
    username: string
    role: UserRole
  } | null
}

export interface AuditLogFilters {
  entityType?: string
}

const COLUMNS = 'id,actor_user_id,action,entity_type,entity_id,metadata,created_at,profiles!audit_logs_actor_user_id_fkey(full_name,username,role)'

function retentionBoundary() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
}

function createQuery(filters: AuditLogFilters, includeCount = false) {
  let query = supabase
    .from('audit_logs')
    .select(COLUMNS, includeCount ? { count: 'exact' } : undefined)
    .gte('created_at', retentionBoundary())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (filters.entityType && filters.entityType !== 'all') {
    query = query.eq('entity_type', filters.entityType)
  }
  return query
}

export async function listAuditLogs(page: number, filters: AuditLogFilters = {}) {
  const safePage = Math.max(1, Math.floor(page))
  const from = (safePage - 1) * AUDIT_LOG_PAGE_SIZE
  const { data, count, error } = await createQuery(filters, true)
    .range(from, from + AUDIT_LOG_PAGE_SIZE - 1)

  if (error) throw error
  return {
    rows: data as unknown as AuditLogRecord[],
    total: count ?? 0,
  }
}

export async function listAllAuditLogs(filters: AuditLogFilters = {}) {
  const rows: AuditLogRecord[] = []
  for (let from = 0; ; from += EXPORT_BATCH_SIZE) {
    const { data, error } = await createQuery(filters)
      .range(from, from + EXPORT_BATCH_SIZE - 1)
    if (error) throw error
    const batch = data as unknown as AuditLogRecord[]
    rows.push(...batch)
    if (batch.length < EXPORT_BATCH_SIZE) return rows
  }
}
