import { supabase } from '../lib/supabase'

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message || `The ${name} request failed.`)
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String(data.error))
  return data as T
}
