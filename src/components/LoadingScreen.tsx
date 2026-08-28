export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-sm text-slate-500 dark:text-slate-400" role="status" aria-live="polite"><span className="relative flex h-10 w-10"><span className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-950" /><span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400" /></span><span>{label}</span></div>
}
