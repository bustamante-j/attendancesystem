import { supabase } from '../lib/supabase'
import type { Student } from '../types/app'
import { invokeFunction } from './functions'

const QUERY_PAGE_SIZE = 500

export interface StudentInput {
  student_number: string
  full_name: string
  year_level: number
  sex: 'Male' | 'Female'
  department_id: string
  is_active: boolean
}

export async function listStudents({ includeDeleted = false }: { includeDeleted?: boolean } = {}) {
  const rows: Student[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    let query = supabase
      .from('students')
      .select('*,departments(id,name,code)')
      .order('full_name')
      .order('id')
      .range(from, from + QUERY_PAGE_SIZE - 1)
    if (!includeDeleted) query = query.is('deleted_at', null)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data as Student[]))
    if (data.length < QUERY_PAGE_SIZE) return rows
  }
}

export async function createStudent(input: StudentInput) {
  const { error } = await supabase.from('students').insert({
    ...input,
    student_number: input.student_number.trim(),
    full_name: input.full_name.trim(),
  })
  if (error) throw error
}

export async function updateStudent(id: string, input: StudentInput) {
  const { error } = await supabase.from('students').update({
    ...input,
    student_number: input.student_number.trim(),
    full_name: input.full_name.trim(),
  }).eq('id', id)
  if (error) throw error
}

export async function setStudentActive(id: string, isActive: boolean) {
  const { error } = await supabase.from('students').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function softDeleteStudent(id: string) {
  const { error } = await supabase.from('students').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function restoreStudent(id: string) {
  const { error } = await supabase.rpc('restore_student', { p_student_id: id })
  if (error) throw error
}

export async function issueStudentQr(studentId: string) {
  return invokeFunction<{ credentialId: string; credential: string; warning: string }>('issue-student-qr', {
    student_id: studentId,
  })
}

export async function viewStudentQr(studentId: string) {
  return invokeFunction<{ credential: string; issuedAt: string }>('view-student-qr', {
    student_id: studentId,
  })
}

export interface StudentQrStatus {
  student_id: string
  has_active_credential: boolean
  issued_at: string | null
  token_prefix: string | null
}

export async function listStudentQrStatuses(studentIds?: string[]) {
  if (studentIds?.length) {
    const rows: StudentQrStatus[] = []
    for (let index = 0; index < studentIds.length; index += QUERY_PAGE_SIZE) {
      const { data, error } = await supabase.rpc('get_student_qr_statuses', {
        p_student_ids: studentIds.slice(index, index + QUERY_PAGE_SIZE),
      })
      if (error) throw error
      rows.push(...(data as StudentQrStatus[]))
    }
    return rows
  }

  const rows: StudentQrStatus[] = []
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc('get_student_qr_statuses', { p_student_ids: null })
      .range(from, from + QUERY_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data as StudentQrStatus[]))
    if (data.length < QUERY_PAGE_SIZE) return rows
  }
}

export async function batchIssueStudentQrs(studentIds: string[]) {
  return invokeFunction<{
    credentials: Array<{ studentId: string; credential: string }>
    warning: string
  }>('batch-issue-student-qrs', { student_ids: studentIds })
}

export interface StudentImportRow {
  source_row?: number
  student_number: string
  full_name: string
  year_level: number
  sex: 'Male' | 'Female'
  department_code: string
  is_active: boolean
}

export interface StudentImportResult {
  inserted: number
  updated: number
  errors: Array<{ row: number; studentNumber: string | null; message: string }>
}

export async function bulkImportStudents(rows: StudentImportRow[], updateExisting: boolean) {
  const { data, error } = await supabase.rpc('bulk_import_students', {
    p_rows: rows,
    p_update_existing: updateExisting,
  })
  if (error) throw error
  return data as StudentImportResult
}
