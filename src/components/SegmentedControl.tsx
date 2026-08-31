import type { LucideIcon } from 'lucide-react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

/**
 * Replaces the four near-identical toggle implementations that previously lived
 * in the dashboard, reports, scanner, and calendar.
 */
export function SegmentedControl<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`segmented-item ${active ? 'segmented-item-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon size={14} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
