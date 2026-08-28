import { supabase } from '../lib/supabase'
import type { Department } from '../types/app'

export async function listDepartments({ includeDeleted = false }: { includeDeleted?: boolean } = {}) {
  let query = supabase
    .from('departments')
    .select('*')
    .order('name')
  if (!includeDeleted) query = query.is('deleted_at', null)
  const { data, error } = await query
  if (error) throw error
  return data as Department[]
}

export async function createDepartment(input: { name: string; code: string }) {
  const { error } = await supabase.from('departments').insert({
    name: input.name.trim(), code: input.code.trim().toUpperCase(),
  })
  if (error) throw error
}

export async function updateDepartment(id: string, input: { name: string; code: string }) {
  const { error } = await supabase.from('departments').update({
    name: input.name.trim(), code: input.code.trim().toUpperCase(),
  }).eq('id', id)
  if (error) throw error
}

export async function softDeleteDepartment(id: string) {
  const { error } = await supabase.rpc('soft_delete_department', { p_department_id: id })
  if (error) throw error
}

export async function restoreDepartment(id: string) {
  const { error } = await supabase.rpc('restore_department', { p_department_id: id })
  if (error) throw error
}
