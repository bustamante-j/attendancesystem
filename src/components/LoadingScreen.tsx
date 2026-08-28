export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-48 items-center justify-center text-sm text-slate-500">{label}</div>
}
