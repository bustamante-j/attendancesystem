/**
 * The source asset is a horizontal lockup: a gradient scan-frame mark occupying
 * roughly the left 29% of a 3:1 image, followed by the "Attendly" wordmark.
 *
 * `markOnly` crops to just the mark. Scaling the image to 115% of the square
 * container narrows the visible source window to about x∈[0,261] of 900, which
 * clears the full mark (ends ~250) without catching the "A" (starts ~290).
 */
export function BrandLogo({ markOnly = false, className = '' }: { markOnly?: boolean; className?: string }) {
  if (markOnly) {
    return (
      <span className={`relative block aspect-square overflow-hidden ${className}`} aria-hidden="true">
        <img
          className="absolute left-0 top-1/2 h-[115%] w-auto max-w-none -translate-y-1/2"
          src="/branding/attendly-logo.webp"
          alt=""
        />
      </span>
    )
  }

  // The wordmark is near-black, so it needs inverting on a dark surface.
  return (
    <img
      className={`object-contain dark:brightness-0 dark:invert ${className}`}
      src="/branding/attendly-logo.webp"
      alt="Attendly"
    />
  )
}
