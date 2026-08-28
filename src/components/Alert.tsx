import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

export function Alert({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' | 'info' }) {
  const colors = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200',
  }
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info
  return <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${colors[tone]}`} role={tone === 'error' ? 'alert' : 'status'}><Icon className="mt-0.5 shrink-0" size={18} /><span>{message}</span></div>
}
