export function BrandLogo({ markOnly = false, className = '' }: { markOnly?: boolean; className?: string }) {
  if (markOnly) {
    return (
      <span className={`block aspect-square overflow-hidden ${className}`} aria-hidden="true">
        <img className="h-full w-auto max-w-none" src="/branding/attendly-logo.png" alt="" />
      </span>
    )
  }

  return <img className={`object-contain dark:brightness-0 dark:invert ${className}`} src="/branding/attendly-logo.png" alt="Attendly" />
}
