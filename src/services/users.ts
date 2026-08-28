import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types/app'
import { invokeFunction } from './functions'

export async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return data as Profile[]
}

export async function createUser(input: { username: string; full_name: string; password: string; role: UserRole }) {
  return invokeFunction<{ user: Profile }>('create-user', input)
}

export async function updateUser(input: { user_id: string; username: string; full_name: string; role: UserRole }) {
  return invokeFunction<{ user: Partial<Profile> }>('update-user', input)
}

export async function resetUserPassword(userId: string, newPassword: string) {
  return invokeFunction<{ success: boolean }>('reset-user-password', {
    user_id: userId,
    new_password: newPassword,
  })
}

export async function setUserEnabled(userId: string, enabled: boolean) {
  const { error } = await supabase.rpc('set_user_enabled', { p_user_id: userId, p_enabled: enabled })
  if (error) throw error
}

export async function forceUserLogout(userId: string) {
  const { error } = await supabase.rpc('force_user_logout', { p_user_id: userId })
  if (error) throw error
}
