export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-base text-muted" role="status" aria-live="polite">
      <span className="relative flex h-6 w-6">
        <span className="absolute inset-0 rounded-full border-2 border-line" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
      </span>
      <span>{label}</span>
    </div>
  )
}
