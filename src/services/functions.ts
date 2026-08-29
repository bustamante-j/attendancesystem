import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

async function functionErrorMessage(name: string, error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json() as { error?: unknown; message?: unknown }
      if (typeof payload.error === 'string' && payload.error) return payload.error
      if (typeof payload.message === 'string' && payload.message) return payload.message
    } catch {
      // Fall through to the SDK message when the response is not JSON.
    }
  }
  if (error instanceof Error && error.message) return error.message
  return `The ${name} request failed.`
}

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(await functionErrorMessage(name, error))
  if (data && typeof data === 'object' && 'error' in data) throw new Error(String(data.error))
  return data as T
}
