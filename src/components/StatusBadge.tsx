import type { ReactNode } from 'react'

export type StatusTone = 'ok' | 'warn' | 'bad' | 'accent' | 'neutral'

const dotColor: Record<StatusTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  accent: 'bg-accent',
  neutral: 'bg-subtle',
}

const softClass: Record<StatusTone, string> = {
  ok: 'badge-ok',
  warn: 'badge-warn',
  bad: 'badge-bad',
  accent: 'badge-accent',
  neutral: 'badge-neutral',
}

/**
 * Two deliberate weights:
 *
 * - `dot` (default) for repeated values inside tables. A coloured dot plus plain
 *   text carries the same meaning as a filled pill without turning a long list
 *   into a field of coloured blocks.
 * - `soft` for a single status that genuinely needs to stand out, such as the
 *   one describing the record a page is about.
 */
export function StatusBadge({ tone = 'neutral', variant = 'dot', children }: {
  tone?: StatusTone
  variant?: 'dot' | 'soft'
  children: ReactNode
}) {
  if (variant === 'soft') {
    return <span className={`badge ${softClass[tone]} capitalize`}>{children}</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap capitalize text-ink">
      <span className={`dot ${dotColor[tone]}`} aria-hidden="true" />
      {children}
    </span>
  )
}
